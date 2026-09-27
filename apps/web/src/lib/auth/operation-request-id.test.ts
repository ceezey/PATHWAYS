import { describe, expect, it } from 'vitest'
import { operationRequestId } from './operation-request-id'

describe('owned operation retry identity', () => {
  const store = () => {
    let sequence = 0
    return operationRequestId(() => `request-${++sequence}`)
  }
  it('reuses the exact expense request after a committed operation loses its response', async () => {
    const requests = store()
    const ledger = new Map<string, string>()
    const submit = async (id: string) => {
      if (!ledger.has(id)) ledger.set(id, 'expense-1')
      return ledger.get(id)
    }
    const body = { amount: '125.00', description: 'Delivery' }
    const first = requests.forBody('actor:project:generation', body)
    await submit(first)
    // The transport failed after commit: no acknowledgement is available to clear the key.
    const retry = requests.forBody('actor:project:generation', { ...body })
    expect(retry).toBe(first)
    expect(await submit(retry)).toBe('expense-1')
    expect(ledger.size).toBe(1)
  })
  it('changes identity when normalized content changes', () => {
    const requests = store()
    expect(requests.forBody('actor', { amount: '2' })).not.toBe(
      requests.forBody('actor', { amount: '1' }),
    )
  })
  it('never reuses a request across ownership or invalidation generations', () => {
    const requests = store()
    const first = requests.forBody('actor:1', {})
    expect(requests.forBody('actor:2', {})).not.toBe(first)
  })
  it('starts a new operation after definite acknowledgement', () => {
    const requests = store()
    const first = requests.forBody('actor', {})
    requests.acknowledge(first)
    expect(requests.forBody('actor', {})).not.toBe(first)
  })
  it('an old acknowledgement cannot clear a newer changed operation', () => {
    const requests = store()
    const first = requests.forBody('actor', { revision: 1 })
    const next = requests.forBody('actor', { revision: 2 })
    requests.acknowledge(first)
    expect(requests.forBody('actor', { revision: 2 })).toBe(next)
  })
})
