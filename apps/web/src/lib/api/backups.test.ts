import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { backupsClient } from './backups'

const authUserId = '79100000-0000-4000-8000-000000000001'
const organizationId = '79100000-0000-4000-8000-000000000002'
const userId = '79100000-0000-4000-8000-000000000003'
const pointId = '79100000-0000-4000-8000-000000000010'
const point = {
  id: pointId,
  pointType: 'MANUAL',
  status: 'READY',
  fileMode: 'manifest',
  createdBy: { id: userId, name: 'Synthetic Admin' },
  startedAt: '2026-11-12T06:00:00.000Z',
  capturedAt: '2026-11-12T06:00:01.000Z',
  completedAt: '2026-11-12T06:00:09.000Z',
  migrationName: '0091_backup_recovery',
  sizeBytes: 1048576,
  failureReason: null,
}
const list = {
  points: [point],
  currentMigration: '0091_backup_recovery',
  fileMode: 'manifest',
  organizationCode: 'ORG1',
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('backupsClient', () => {
  it('lists recovery points with GET /backups and the caller signal', async () => {
    fetcher.mockResolvedValueOnce(json(list))
    const controller = new AbortController()
    await expect(backupsClient.list(controller.signal)).resolves.toMatchObject({ points: [point] })
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(String(url)).toBe('http://127.0.0.1:4000/api/backups')
    expect(init?.signal).toBe(controller.signal)
  })

  it('creates with POST /backups and no body', async () => {
    fetcher.mockResolvedValueOnce(json(point))
    await expect(backupsClient.create()).resolves.toMatchObject({ id: pointId })
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(String(url)).toBe('http://127.0.0.1:4000/api/backups')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeUndefined()
  })

  it('verifies with POST /backups/:id/verify and no body', async () => {
    fetcher.mockResolvedValueOnce(json({ point, problem: null }))
    await backupsClient.verify(pointId)
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(String(url)).toBe(`http://127.0.0.1:4000/api/backups/${pointId}/verify`)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeUndefined()
  })

  it('downloads with the passphrase as the JSON body', async () => {
    fetcher.mockResolvedValueOnce(
      json({
        dataUrl: 'https://storage.invalid/data',
        manifestUrl: 'https://storage.invalid/manifest',
        expiresAt: '2026-11-12T06:02:00.000Z',
      }),
    )
    await backupsClient.download(pointId, { passphrase: 'correct horse battery' })
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(String(url)).toBe(`http://127.0.0.1:4000/api/backups/${pointId}/download`)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ passphrase: 'correct horse battery' }))
  })

  it('restores with the typed organization code as the JSON body', async () => {
    fetcher.mockResolvedValueOnce(
      json({
        point,
        preRestorePointId: pointId,
        rowCounts: { 'pathways.projects': 6 },
        filesRestored: 0,
      }),
    )
    await backupsClient.restore(pointId, { organizationCode: 'ORG1' })
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(String(url)).toBe(`http://127.0.0.1:4000/api/backups/${pointId}/restore`)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ organizationCode: 'ORG1' }))
  })

  it('refuses a non-UUID point id before any request', async () => {
    await expect(backupsClient.verify('../users')).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a list row with an unknown key or status', async () => {
    fetcher.mockResolvedValueOnce(json({ ...list, points: [{ ...point, status: 'DONE' }] }))
    await expect(backupsClient.list()).rejects.toThrow('could not be validated')
    fetcher.mockResolvedValueOnce(json({ ...list, points: [{ ...point, path: 'x' }] }))
    await expect(backupsClient.list()).rejects.toThrow('could not be validated')
  })

  it('keeps the server message of a 503 refusal', async () => {
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Backup storage is unavailable. Try again later.',
          code: 'STORAGE_UNAVAILABLE',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await expect(backupsClient.create()).rejects.toMatchObject({
      status: 503,
      message: 'Backup storage is unavailable. Try again later.',
    })
  })
})
