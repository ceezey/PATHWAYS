// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPendingCreate,
  createdSince,
  hashFingerprint,
  isDefinitiveClientError,
  pendingCreateKey,
  readPendingCreate,
  writePendingCreate,
} from './pending-create'

const scope = { organizationId: 'org', userId: 'user', projectId: null }
const key = pendingCreateKey('project', scope)
afterEach(() => sessionStorage.clear())

describe('pending create markers', () => {
  it('round-trips a fresh marker and clears it', () => {
    writePendingCreate(key, { startedAt: 1_000, fingerprint: 'a' })
    expect(readPendingCreate(key, 2_000)).toEqual({ startedAt: 1_000, fingerprint: 'a' })
    clearPendingCreate(key)
    expect(readPendingCreate(key, 2_000)).toBeNull()
  })
  it('discards and removes a marker older than three minutes', () => {
    writePendingCreate(key, { startedAt: 0, fingerprint: 'a' })
    expect(readPendingCreate(key, 3 * 60_000 + 1)).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })
  it('keys markers per kind, organization and user', () => {
    expect(pendingCreateKey('activity', scope)).not.toBe(key)
    expect(pendingCreateKey('project', { ...scope, userId: 'other' })).not.toBe(key)
  })
  it('treats 4xx as definitive and network or unknown errors as not', () => {
    expect(isDefinitiveClientError({ status: 422, code: 'invalid' })).toBe(true)
    expect(isDefinitiveClientError({ status: 503, code: 'network' })).toBe(false)
    expect(isDefinitiveClientError({ code: 'network' })).toBe(false)
    expect(isDefinitiveClientError(new TypeError('Failed to fetch'))).toBe(false)
  })
  it('hashes fingerprints without exposing the input', async () => {
    const hash = await hashFingerprint('Jane Doe', '2000-01-01')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(await hashFingerprint(' jane doe ', '2000-01-01'))
  })
  it('allows five seconds of skew when matching created-at', () => {
    expect(createdSince(new Date(95_000).toISOString(), 100_000)).toBe(true)
    expect(createdSince(new Date(94_000).toISOString(), 100_000)).toBe(false)
    expect(createdSince(undefined, 0)).toBe(false)
  })
})
