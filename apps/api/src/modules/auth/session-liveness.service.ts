import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { prismaDiagnosticCode, transactionDiagnostic } from '../../prisma/transaction-diagnostic'
import { UUID_PATTERN } from './developer-access'

// Fixed operational categories only. Never serialize error messages, metadata,
// nested causes or arbitrary provider codes into a diagnostic event.
const diagnosticCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2010'])
type VerificationStage =
  | 'TRANSACTION_START'
  | 'READ_ONLY_SETUP'
  | 'CONTEXT_SETUP'
  | 'SESSION_READ'
  | 'TRANSACTION_COMPLETION'
  | 'RESULT_VALIDATION'

/** Internal contract, never an HTTP/RPC lookup accepting browser identifiers.
 * Call only after signature, claim and online Auth-user validation. No cache.
 */
@Injectable()
export class SessionLivenessService {
  private readonly logger = new Logger(SessionLivenessService.name)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async assertLive(subject: string, sessionId: string): Promise<void> {
    if (!UUID_PATTERN.test(subject) || !UUID_PATTERN.test(sessionId)) {
      throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
    }
    let rows: Array<{ live: boolean }>
    let stage: VerificationStage = 'TRANSACTION_START'
    try {
      rows = await this.prisma.$transaction(
        async (transaction) => {
          stage = 'READ_ONLY_SETUP'
          await transaction.$executeRaw`SET TRANSACTION READ ONLY`
          stage = 'CONTEXT_SETUP'
          await transaction.$queryRaw`
            SELECT set_config('request.jwt.claim.sub', ${subject}, true),
              set_config('request.jwt.claims', '', true),
              set_config('statement_timeout', '5000', true),
              set_config('lock_timeout', '1000', true)
          `
          stage = 'SESSION_READ'
          const result = await transaction.$queryRaw<Array<{ live: boolean }>>`
            SELECT pathways.runtime_auth_session_live(${subject}::uuid, ${sessionId}::uuid) AS live
          `
          stage = 'TRANSACTION_COMPLETION'
          return result
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        },
      )
    } catch (error) {
      // No SQL, UUIDs, provider response, nested cause or credential in telemetry.
      const code = prismaDiagnosticCode(error)
      try {
        this.logger.warn({
          event: 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',
          stage,
          reason: diagnosticCodes.has(code) ? code : 'DATABASE_CHECK_FAILED',
          ...transactionDiagnostic(error),
        })
      } catch {
        // An unavailable diagnostic sink must not replace the fixed denial.
      }
      throw new ServiceUnavailableException('Session verification is temporarily unavailable.')
    }
    if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.live !== 'boolean') {
      this.logger.warn({
        event: 'PATHWAYS_SESSION_LIVENESS_UNAVAILABLE',
        stage: 'RESULT_VALIDATION',
        reason: 'INVALID_RESULT',
      })
      throw new ServiceUnavailableException('Session verification is temporarily unavailable.')
    }
    if (!rows[0].live) {
      throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
    }
  }
}
