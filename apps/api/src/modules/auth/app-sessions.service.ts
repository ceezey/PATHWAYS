import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'

import { type AppSessionView, recordSessionActivity } from '../../common/authz/app-sessions'
import { PrismaService } from '../../prisma/prisma.service'
import { prismaDiagnosticCode } from '../../prisma/transaction-diagnostic'

const TOUCH_INTERVAL_MS = 60_000
const MAX_TRACKED = 10_000

@Injectable()
export class AppSessionsService {
  private readonly logger = new Logger(AppSessionsService.name)
  private readonly touched = new Map<string, number>()

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Called by the guard for every verified request; writes at most once a minute per session on this instance unless forced. */
  async touch(subject: string, sessionId: string, device: string | undefined, force = false) {
    const now = Date.now()
    if (!force && (this.touched.get(sessionId) ?? 0) > now - TOUCH_INTERVAL_MS) return
    // Marked only after the write: a parallel request that skipped it could read a new session before its row commits.
    try {
      await recordSessionActivity(this.prisma, subject, sessionId, device)
    } catch (error) {
      this.logger.warn({
        event: 'PATHWAYS_SESSION_TOUCH_UNAVAILABLE',
        reason: prismaDiagnosticCode(error) || 'DATABASE_CHECK_FAILED',
      })
      throw new ServiceUnavailableException('Session verification is temporarily unavailable.')
    }
    if (this.touched.size >= MAX_TRACKED) this.touched.clear()
    this.touched.set(sessionId, now)
  }

  async list(subject: string, sessionId: string): Promise<AppSessionView[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        session_id: string
        device: string | null
        started_at: Date
        last_active_at: Date
        is_current: boolean
      }>
    >`SELECT * FROM pathways.app_session_list(${subject}::uuid, ${sessionId}::uuid)`
    return rows.map((row) => ({
      id: row.session_id,
      device: row.device,
      startedAt: row.started_at.toISOString(),
      lastActiveAt: row.last_active_at.toISOString(),
      current: row.is_current,
    }))
  }
}
