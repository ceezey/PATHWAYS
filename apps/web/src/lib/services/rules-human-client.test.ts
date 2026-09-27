import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rulesHumanClient } from './rules-human-client'
const transport = vi.hoisted(() => vi.fn())
vi.mock('@/lib/services/pathways-client', () => ({
  requestFoundationResponse: transport,
  PathwaysClientError: class extends Error {
    constructor(
      message: string,
      readonly kind: string,
      readonly fieldErrors?: unknown,
      readonly status?: number,
    ) {
      super(message)
    }
  },
}))
const id = '10000000-0000-4000-8000-000000000001'
const record = {
  id,
  projectId: '20000000-0000-4000-8000-000000000001',
  alertId: '30000000-0000-4000-8000-000000000001',
  ruleId: '40000000-0000-4000-8000-000000000001',
  title: 'Synthetic recommendation',
  text: 'Review activity scheduling.',
  basis: 'Recorded overdue condition.',
  status: 'NEW',
  revision: '1',
  proposedAt: '2026-09-27T01:00:00Z',
  reviewedAt: null,
}
const response = (value: unknown) => ({
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => value,
})
beforeEach(() => {
  vi.clearAllMocks()
  document.cookie = 'pathways-context=owner-a; Path=/'
  transport.mockResolvedValue(response(record))
})
describe('strict human rules transport', () => {
  it('binds a detail response to the requested record', async () => {
    transport.mockResolvedValueOnce(
      response({ ...record, id: '10000000-0000-4000-8000-000000000002' }),
    )
    await expect(rulesHumanClient.getRecommendation(id)).rejects.toThrow('requested record')
  })
  it('rejects unexpected private note or pointer fields instead of rendering them', async () => {
    for (const extra of [{ note: 'private' }, { privatePointer: 'private' }, { hasNote: true }]) {
      transport.mockResolvedValueOnce(response({ ...record, ...extra }))
      await expect(rulesHumanClient.getRecommendation(id)).rejects.toThrow('could not be validated')
    }
  })
  it('drops a response whose body finishes after logout and returning to the same account', async () => {
    let finish: (value: unknown) => void = () => {}
    transport.mockResolvedValueOnce({
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    })
    const pending = rulesHumanClient.getRecommendation(id)
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce())
    clearSensitiveDraftStorage()
    finish(record)
    await expect(pending).rejects.toThrow('ownership changed')
  })
  it('drops a response when the workspace cookie changes while awaiting transport', async () => {
    let finish: (value: unknown) => void = () => {}
    transport.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const pending = rulesHumanClient.getRecommendation(id)
    document.cookie = 'pathways-context=owner-b; Path=/'
    finish(response(record))
    await expect(pending).rejects.toThrow('ownership changed')
  })
  it('rejects unknown query selectors and malformed optimistic revisions before dispatch', async () => {
    expect(() =>
      rulesHumanClient.listRecommendations({ unknownSelector: 'all' } as never),
    ).toThrow()
    expect(() =>
      rulesHumanClient.reviewRecommendation(id, {
        expectedRevision: '0',
        note: 'Reason',
        clientOperationId: id,
      }),
    ).toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('sends exact bounded selectors and notes only in authorized mutation input', async () => {
    transport.mockResolvedValueOnce(response({ items: [record], nextCursor: null }))
    await rulesHumanClient.listRecommendations({ projectId: record.projectId, limit: '25' })
    expect(transport).toHaveBeenNthCalledWith(
      1,
      `/recommendations?projectId=${record.projectId}&limit=25`,
      { signal: undefined },
    )
    await rulesHumanClient.reviewRecommendation(id, {
      expectedRevision: '1',
      note: '  Private reason  ',
      clientOperationId: id,
    })
    expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({
      expectedRevision: '1',
      note: 'Private reason',
      clientOperationId: id,
    })
  })
})
