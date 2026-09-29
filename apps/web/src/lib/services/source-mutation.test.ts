import { describe, expect, it, vi } from 'vitest'
import { SourceMutationTickets, parseSourceMutationResult } from './source-mutation'
const id = '20000000-0000-4000-8000-000000000001'
const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const ack = (requestId = id) => ({ requestId, committed: true, replayed: true })
const fresh = {
  id: 'record',
  sourceAcknowledgement: { requestId: id, committed: true, replayed: false },
}
const parse = (value: unknown) => value as { id: string }
describe('owned source mutation recovery', () => {
  it('retains exact request identity across a lost response and accepts only its own strict replay acknowledgement', async () => {
    const tickets = new SourceMutationTickets(() => id)
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce(ack())
    await expect(
      tickets.execute(
        context,
        'POST:project/activity',
        { title: 'Synthetic', expectedRevision: 2 },
        send,
        parse,
      ),
    ).rejects.toThrow('lost response')
    expect(
      await tickets.execute(
        context,
        'POST:project/activity',
        { expectedRevision: 2, title: 'Synthetic' },
        send,
        parse,
      ),
    ).toEqual(ack())
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0])
    expect(send.mock.calls[0][0].clientMutationId).toBe(id)
    expect(tickets.pendingRecovery(context, 'POST:project/activity')?.requestId).toBe(id)
    tickets.finishAcknowledgement(context, id)
    expect(tickets.pendingRecovery(context, 'POST:project/activity')).toBeNull()
  })
  it('refuses changed input and expected revision before dispatch while the earlier outcome remains unresolved', async () => {
    const tickets = new SourceMutationTickets(() => id)
    const send = vi.fn().mockRejectedValue(new Error('uncertain'))
    await expect(
      tickets.execute(
        context,
        'PATCH:project',
        { expectedRevision: 2, title: 'Original' },
        send,
        parse,
      ),
    ).rejects.toThrow()
    for (const body of [
      { expectedRevision: 3, title: 'Original' },
      { expectedRevision: 2, title: 'Changed' },
    ])
      await expect(tickets.execute(context, 'PATCH:project', body, send, parse)).rejects.toThrow(
        'earlier save outcome is unresolved',
      )
    expect(send).toHaveBeenCalledOnce()
  })
  it.each([403, 409])(
    'does not clear an unresolved operation after HTTP %s or recovery age',
    async (status) => {
      let now = 0
      const tickets = new SourceMutationTickets(
        () => id,
        () => now,
      )
      const send = vi.fn().mockRejectedValueOnce({ status }).mockResolvedValueOnce(ack())
      await expect(
        tickets.execute(context, 'PATCH:project', { title: 'Original' }, send, parse),
      ).rejects.toEqual({ status })
      now = 16 * 60 * 1000
      expect(tickets.pendingRecovery(context, 'PATCH:project')).toEqual({
        requestId: id,
        expired: true,
      })
      await tickets.execute(context, 'PATCH:project', { title: 'Original' }, send, parse)
      expect(send.mock.calls[1][0].clientMutationId).toBe(id)
    },
  )
  it('prevents duplicate simultaneous submission and discards an old-owner continuation', async () => {
    let live = true
    let resolve: ((value: unknown) => void) | undefined
    const owner = { ...context, isCurrent: () => live }
    const tickets = new SourceMutationTickets(() => id)
    const send = vi.fn(
      () =>
        new Promise<unknown>((done) => {
          resolve = done
        }),
    )
    const pending = tickets.execute(owner, 'PATCH:project', { title: 'Original' }, send, parse)
    await expect(
      tickets.execute(owner, 'PATCH:project', { title: 'Original' }, send, parse),
    ).rejects.toThrow('already in progress')
    live = false
    if (!resolve) throw new Error('Test continuation unavailable')
    resolve(fresh)
    await expect(pending).rejects.toThrow('ownership changed')
    expect(send).toHaveBeenCalledOnce()
  })
  it('does not let an old response clear a newer principal ticket', async () => {
    let resolve: ((value: unknown) => void) | undefined
    const tickets = new SourceMutationTickets(() => id)
    const old = tickets.execute(
      context,
      'PATCH:project',
      { title: 'A' },
      () =>
        new Promise((done) => {
          resolve = done
        }),
      parse,
    )
    const newer = { ...context, principalKey: 'synthetic-owner-b' }
    await expect(
      tickets.execute(
        newer,
        'PATCH:project',
        { title: 'B' },
        async () => {
          throw new Error('B uncertain')
        },
        parse,
      ),
    ).rejects.toThrow('B uncertain')
    if (!resolve) throw new Error('Test continuation unavailable')
    resolve(fresh)
    await expect(old).rejects.toThrow('ownership changed')
    expect(tickets.pendingRecovery(newer, 'PATCH:project')).toEqual({
      requestId: id,
      expired: false,
    })
  })
  it('fails closed before the 33rd unresolved operation or an oversized body', async () => {
    let number = 0
    const tickets = new SourceMutationTickets(
      () => `20000000-0000-4000-8000-${String(++number).padStart(12, '0')}`,
    )
    const send = vi.fn(async () => {
      throw new Error('uncertain')
    })
    for (let index = 0; index < 32; index++)
      await expect(tickets.execute(context, `PATCH:${index}`, {}, send, parse)).rejects.toThrow(
        'uncertain',
      )
    await expect(tickets.execute(context, 'PATCH:33', {}, send, parse)).rejects.toThrow(
      'Resolve an earlier save',
    )
    expect(send).toHaveBeenCalledTimes(32)
    const empty = new SourceMutationTickets(() => id)
    await expect(
      empty.execute(context, 'PATCH:large', { title: 'x'.repeat(65537) }, send, parse),
    ).rejects.toThrow('supported bounds')
    expect(send).toHaveBeenCalledTimes(32)
  })
  it.each([
    { ...ack(), note: 'not allowed' },
    ack('20000000-0000-4000-8000-000000000099'),
    { ...fresh, sourceAcknowledgement: { ...fresh.sourceAcknowledgement, actorId: 'not allowed' } },
  ])(
    'retains the key on malformed or unrelated receipt without projecting a DTO',
    async (response) => {
      const tickets = new SourceMutationTickets(() => id)
      const mapper = vi.fn(parse)
      await expect(
        tickets.execute(context, 'PATCH:project', {}, async () => response, mapper),
      ).rejects.toThrow()
      expect(mapper).not.toHaveBeenCalled()
      expect(tickets.pendingRecovery(context, 'PATCH:project')?.requestId).toBe(id)
    },
  )
  it('requires a valid projected DTO before releasing a fresh acknowledgement ticket', async () => {
    const tickets = new SourceMutationTickets(() => id)
    await expect(
      tickets.execute(
        context,
        'PATCH:project',
        {},
        async () => fresh,
        () => {
          throw new Error('invalid DTO')
        },
      ),
    ).rejects.toThrow('invalid DTO')
    expect(tickets.pendingRecovery(context, 'PATCH:project')?.requestId).toBe(id)
  })
  it('retains original body until certified abandonment AND a successful current reload', async () => {
    let number = 0
    const tickets = new SourceMutationTickets(
      () => `20000000-0000-4000-8000-${String(++number).padStart(12, '0')}`,
    )
    await expect(
      tickets.execute(
        context,
        'PATCH:project',
        { title: 'Original' },
        async () => {
          throw Error('uncertain')
        },
        parse,
      ),
    ).rejects.toThrow()
    const send = vi.fn(async (input) => ({ requestId: input.requestId, abandoned: true }))
    expect(await tickets.recover(context, 'PATCH:project', send)).toBe('ABANDONED')
    expect(send.mock.calls[0][0]).toEqual({ requestId: id, body: { title: 'Original' } })
    await expect(
      tickets.execute(context, 'PATCH:project', { title: 'Changed' }, async () => ack(), parse),
    ).rejects.toThrow('finish recovery')
    expect(await tickets.recover(context, 'PATCH:project', send)).toBe('ABANDONED')
    expect(send).toHaveBeenCalledOnce()
    tickets.finishRecovery(context, 'PATCH:project')
    const next = '20000000-0000-4000-8000-000000000002'
    expect(
      await tickets.execute(
        context,
        'PATCH:project',
        { title: 'Changed' },
        async () => ack(next),
        parse,
      ),
    ).toEqual(ack(next))
  })
  it.each([
    null,
    { requestId: id, abandoned: false },
    { requestId: id, abandoned: true, actorId: 'private' },
    { requestId: 'other', abandoned: true },
    { requestId: id, committed: true, replayed: false },
  ])('never releases on malformed or unrelated abandonment certification', async (response) => {
    const tickets = new SourceMutationTickets(() => id)
    await expect(
      tickets.execute(
        context,
        'PATCH:project',
        {},
        async () => {
          throw Error('uncertain')
        },
        parse,
      ),
    ).rejects.toThrow()
    await expect(tickets.recover(context, 'PATCH:project', async () => response)).rejects.toThrow()
    expect(tickets.pendingRecovery(context, 'PATCH:project')?.requestId).toBe(id)
    expect(() => tickets.finishRecovery(context, 'PATCH:project')).toThrow('confirmed outcome')
  })
  it('discards a recovery response after owner loss without clearing another current owner ticket', async () => {
    const tickets = new SourceMutationTickets(() => id)
    await expect(
      tickets.execute(
        context,
        'PATCH:project',
        {},
        async () => {
          throw Error('uncertain')
        },
        parse,
      ),
    ).rejects.toThrow()
    let resolve: ((value: unknown) => void) | undefined
    const pending = tickets.recover(
      context,
      'PATCH:project',
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const next = { ...context, principalKey: 'B' }
    await expect(
      tickets.execute(
        next,
        'PATCH:project',
        {},
        async () => {
          throw Error('uncertain')
        },
        parse,
      ),
    ).rejects.toThrow()
    if (!resolve) throw Error('Missing continuation')
    resolve({ requestId: id, abandoned: true })
    await expect(pending).rejects.toThrow('ownership changed')
    expect(tickets.pendingRecovery(next, 'PATCH:project')?.requestId).toBe(id)
  })
  it('preserves exact multipart handles and id across navigation, forbids changed files, and clears sensitive handles on owner loss', async () => {
    const file = new File(['synthetic'], 'synthetic.txt', { type: 'text/plain' })
    const tickets = new SourceMutationTickets(() => id)
    const body = { progressPercent: 20, note: 'Synthetic proof' }
    const send = vi.fn().mockRejectedValueOnce(Error('uncertain')).mockResolvedValueOnce(ack())
    await expect(
      tickets.execute(context, 'POST:proof', body, send, parse, {
        files: [file],
        keyField: 'clientUpdateId',
        allowLegacy: true,
      }),
    ).rejects.toThrow()
    expect(tickets.proofSnapshot(context, 'POST:proof')?.files[0]).toBe(file)
    await expect(
      tickets.execute(context, 'POST:proof', body, send, parse, {
        files: [new File(['synthetic'], 'synthetic.txt')],
        keyField: 'clientUpdateId',
      }),
    ).rejects.toThrow('identical files')
    expect(
      await tickets.execute(context, 'POST:proof', body, send, parse, {
        files: [file],
        keyField: 'clientUpdateId',
        allowLegacy: true,
      }),
    ).toEqual(ack())
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0])
    expect(send.mock.calls[1][0].clientUpdateId).toBe(id)
    tickets.finishAcknowledgement(context, id)
    await expect(
      tickets.execute(
        context,
        'POST:proof',
        body,
        async () => {
          throw Error('uncertain')
        },
        parse,
        { files: [file] },
      ),
    ).rejects.toThrow()
    tickets.synchronizePrincipal('B')
    expect(tickets.proofSnapshot(context, 'POST:proof')).toBeNull()
  })
  it('accepts legacy proof/measurement DTO only on their explicitly permitted path and checks new receipts against the original key', () => {
    expect(parseSourceMutationResult({ id: 'record' }, id, parse, true)).toEqual({ id: 'record' })
    expect(() => parseSourceMutationResult({ id: 'record' }, id, parse)).toThrow()
    expect(() =>
      parseSourceMutationResult({ ...ack(), requestId: 'other' }, id, parse, true),
    ).toThrow()
    expect(parseSourceMutationResult(fresh, id, parse, true)).toEqual({ id: 'record' })
  })
})
