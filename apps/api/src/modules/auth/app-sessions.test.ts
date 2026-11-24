import { ServiceUnavailableException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionIdOf } from '../../common/authz/app-sessions'
import type { PrismaService } from '../../prisma/prisma.service'
import { AppSessionsService } from './app-sessions'

const SUBJECT = '50000000-0000-4000-8000-000000000001'
const SESSION = '50000000-0000-4000-8000-000000000002'
const prisma = { $queryRaw: vi.fn() }
let service: AppSessionsService

beforeEach(() => {
  vi.useRealTimers()
  prisma.$queryRaw.mockReset().mockResolvedValue([{ n: 0 }])
  service = new AppSessionsService(prisma as unknown as PrismaService)
})

describe('session activity', () => {
  it('records activity once a minute per session, with the device cut to 200 characters', async () => {
    vi.useFakeTimers()
    await service.touch(SUBJECT, SESSION, 'x'.repeat(250))
    await service.touch(SUBJECT, SESSION, 'x')
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    expect(prisma.$queryRaw.mock.calls[0]?.slice(1)).toEqual([SUBJECT, SESSION, 'x'.repeat(200)])
    vi.advanceTimersByTime(60_001)
    await service.touch(SUBJECT, SESSION, undefined)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
    expect(prisma.$queryRaw.mock.calls[1]?.slice(1)).toEqual([SUBJECT, SESSION, null])
  })

  it('records a forced heartbeat even inside the minute', async () => {
    await service.touch(SUBJECT, SESSION, undefined)
    await service.touch(SUBJECT, SESSION, undefined, true)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
  })

  it('fails closed with 503 and retries on the next request when the database is unavailable', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection reset'))
    await expect(service.touch(SUBJECT, SESSION, undefined)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    await service.touch(SUBJECT, SESSION, undefined)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
  })

  it('lists open sessions as ISO times with the current flag', async () => {
    const at = new Date('2026-11-25T01:00:00.000Z')
    prisma.$queryRaw.mockResolvedValue([
      {
        session_id: SESSION,
        device: 'Phone',
        started_at: at,
        last_active_at: at,
        is_current: true,
      },
    ])
    await expect(service.list(SUBJECT, SESSION)).resolves.toEqual([
      {
        id: SESSION,
        device: 'Phone',
        startedAt: at.toISOString(),
        lastActiveAt: at.toISOString(),
        current: true,
      },
    ])
  })
})

describe('sessionIdOf', () => {
  const token = (payload: unknown) =>
    `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`

  it('reads the session id of an identity-provider access token', () => {
    expect(sessionIdOf(token({ session_id: SESSION }))).toBe(SESSION)
  })

  it.each([
    ['no id', token({})],
    ['not a uuid', token({ session_id: 'abc' })],
    ['garbage', 'x.%%%.y'],
    ['empty', ''],
  ])('returns null for %s', (_label, value) => expect(sessionIdOf(value)).toBeNull())
})
