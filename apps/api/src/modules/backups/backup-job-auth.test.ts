import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { assertBackupJobRequest } from './backup-job-auth'

const token = 'c'.repeat(64)
const bearer = `Bearer ${token}`
const request = (patch: Record<string, unknown> = {}) => ({
  method: 'POST',
  rawHeaders: ['Host', 'api.invalid', 'Authorization', bearer],
  headers: { host: 'api.invalid', authorization: bearer },
  body: undefined,
  query: {},
  ...patch,
})

describe('assertBackupJobRequest', () => {
  it('accepts the exact token', () => {
    expect(() => assertBackupJobRequest(request(), token)).not.toThrow()
  })

  it.each([
    [
      'a wrong token',
      request({
        headers: { authorization: `Bearer ${'d'.repeat(64)}` },
        rawHeaders: ['Authorization', `Bearer ${'d'.repeat(64)}`],
      }),
    ],
    [
      'an uppercase token',
      request({
        headers: { authorization: `Bearer ${'C'.repeat(64)}` },
        rawHeaders: ['Authorization', `Bearer ${'C'.repeat(64)}`],
      }),
    ],
    [
      'two authorization headers',
      request({ rawHeaders: ['Authorization', bearer, 'authorization', bearer] }),
    ],
    [
      'a cookie header',
      request({
        rawHeaders: ['Authorization', bearer, 'Cookie', 'a=b'],
        headers: { authorization: bearer, cookie: 'a=b' },
      }),
    ],
    ['a non-empty body', request({ body: { organizationId: 'x' } })],
    ['a query', request({ query: { organizationId: 'x' } })],
    ['a GET', request({ method: 'GET' })],
  ])('denies %s', (_label, value) => {
    expect(() => assertBackupJobRequest(value, token)).toThrow(ForbiddenException)
  })

  it('denies every request when no token is configured', () => {
    expect(() => assertBackupJobRequest(request(), '')).toThrow('Backup job is unavailable.')
  })
})
