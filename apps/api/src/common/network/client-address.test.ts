import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clientAddress, visitorAddress } from './client-address'

const TOKEN = 'a'.repeat(64)
const request = (socket: string | undefined, headers: Record<string, string | string[]> = {}) =>
  ({ headers, socket: { remoteAddress: socket } }) as unknown as IncomingMessage

afterEach(() => vi.unstubAllEnvs())

describe('clientAddress', () => {
  it('uses the socket address off Vercel and ignores forged proxy headers', () => {
    const forged = { 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '8.8.8.8' }
    expect(clientAddress(request('10.1.2.3', forged))).toBe('10.1.2.3')
  })

  it('uses the single x-real-ip value on Vercel and never x-forwarded-for', () => {
    vi.stubEnv('VERCEL', '1')
    const headers = { 'x-forwarded-for': '9.9.9.9', 'x-real-ip': ' 203.0.113.7 ' }
    expect(clientAddress(request('10.1.2.3', headers))).toBe('203.0.113.7')
    expect(clientAddress(request('10.1.2.3', { 'x-forwarded-for': '9.9.9.9' }))).toBe('unknown')
  })

  it('answers unknown for anything that is not an address', () => {
    expect(clientAddress(request(undefined))).toBe('unknown')
    expect(clientAddress(request('not-an-address'))).toBe('unknown')
    vi.stubEnv('VERCEL', '1')
    expect(clientAddress(request(undefined, { 'x-real-ip': ['1.1.1.1', '2.2.2.2'] }))).toBe(
      'unknown',
    )
    expect(clientAddress(request(undefined, { 'x-real-ip': '1.1.1.1, 2.2.2.2' }))).toBe('unknown')
  })
})

describe('visitorAddress', () => {
  const visitor = { 'x-pathways-visitor-address': '198.51.100.4' }

  it('ignores the visitor header without the right token', () => {
    expect(visitorAddress(request('10.1.2.3', visitor), TOKEN)).toBe('10.1.2.3')
    const wrong = { ...visitor, 'x-pathways-visitor-token': 'b'.repeat(64) }
    expect(visitorAddress(request('10.1.2.3', wrong), TOKEN)).toBe('10.1.2.3')
    const malformed = { ...visitor, 'x-pathways-visitor-token': 'zz' }
    expect(visitorAddress(request('10.1.2.3', malformed), TOKEN)).toBe('10.1.2.3')
  })

  it('uses the visitor address with the right token, if it is an address', () => {
    const headers = { ...visitor, 'x-pathways-visitor-token': TOKEN }
    expect(visitorAddress(request('10.1.2.3', headers), TOKEN)).toBe('198.51.100.4')
    const bad = { 'x-pathways-visitor-address': 'evil', 'x-pathways-visitor-token': TOKEN }
    expect(visitorAddress(request('10.1.2.3', bad), TOKEN)).toBe('10.1.2.3')
  })

  it('never trusts a header when no token is configured', () => {
    const headers = { ...visitor, 'x-pathways-visitor-token': '' }
    expect(visitorAddress(request('10.1.2.3', headers), '')).toBe('10.1.2.3')
  })
})
