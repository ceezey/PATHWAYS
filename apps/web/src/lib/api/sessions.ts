import { z } from 'zod'

import { requestFoundation, requestFoundationResponse } from '@/lib/api/core/request'

const appSession = z.object({
  id: z.string().uuid(),
  device: z.string().max(200).nullable(),
  startedAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  current: z.boolean(),
})
export type AppSession = z.infer<typeof appSession>

// The caller's own sessions; the API ends them and records who did.
export const sessionsClient = {
  async list(): Promise<AppSession[]> {
    return z
      .array(appSession)
      .max(10)
      .parse(await requestFoundation('/auth/sessions'))
  },
  async end(sessionId: string) {
    await requestFoundationResponse(`/auth/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST',
    })
  },
  async endOthers() {
    await requestFoundationResponse('/auth/sessions/end-others', { method: 'POST' })
  },
  // Tells the API the user is still working, so the 30-minute idle limit does not end the session.
  async heartbeat() {
    await requestFoundationResponse('/auth/sessions/activity', { method: 'POST' })
  },
}
