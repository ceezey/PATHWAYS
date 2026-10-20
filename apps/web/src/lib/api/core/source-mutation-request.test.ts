// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestFoundation = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('./request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./request')>()),
  requestFoundation,
}))

import { sourceMutationTickets } from '@/lib/api/core/source-mutation'
import { PathwaysClientError } from './request'
import { requestSourceMutation } from './source-mutation-request'

const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const parse = vi.fn((value: unknown) => value as { id: string })

// Answers like the API: the acknowledgement echoes the request id the client sent.
const acknowledge = (replayed: boolean) => async (_path: string, init: RequestInit) => {
  const sent = JSON.parse(String(init.body)) as { clientMutationId: string }
  return replayed
    ? { requestId: sent.clientMutationId, committed: true, replayed: true }
    : {
        id: 'record-1',
        sourceAcknowledgement: {
          requestId: sent.clientMutationId,
          committed: true,
          replayed: false,
        },
      }
}

describe('requestSourceMutation', () => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    requestFoundation.mockReset()
    parse.mockClear()
  })

  it('refuses to send without a mutation context', async () => {
    const result = requestSourceMutation('/projects/p-1', 'PATCH', { title: 'A' }, undefined, parse)
    await expect(result).rejects.toBeInstanceOf(PathwaysClientError)
    await expect(result).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Current mutation ownership is required.',
    })
    expect(requestFoundation).not.toHaveBeenCalled()
  })

  it('sends the body with its request id and ownership check, and returns the parsed record', async () => {
    requestFoundation.mockImplementation(acknowledge(false))
    const result = await requestSourceMutation(
      '/projects/p-2',
      'PATCH',
      { title: 'A' },
      context,
      parse,
    )
    expect(result).toEqual({ id: 'record-1' })
    expect(parse).toHaveBeenCalledTimes(1)
    const [path, init, isCurrent] = requestFoundation.mock.calls[0]
    expect(path).toBe('/projects/p-2')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toMatchObject({ title: 'A' })
    expect(JSON.parse(init.body).clientMutationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(isCurrent).toBe(context.isCurrent)
  })

  it('returns the replay acknowledgement when the server reports a replay', async () => {
    requestFoundation.mockImplementation(acknowledge(true))
    const result = await requestSourceMutation('/projects/p-3', 'POST', { a: 1 }, context, parse)
    expect(result).toMatchObject({ committed: true, replayed: true })
    expect(parse).not.toHaveBeenCalled()
  })

  it('maps an unconfirmed outcome to an invalid client error', async () => {
    requestFoundation.mockResolvedValue({ id: 'record-1' })
    const result = requestSourceMutation('/projects/p-4', 'POST', { a: 1 }, context, parse)
    await expect(result).rejects.toBeInstanceOf(PathwaysClientError)
    await expect(result).rejects.toMatchObject({
      code: 'invalid',
      message: 'The save outcome could not be confirmed. Retry the unchanged input.',
    })
  })

  it('rethrows a transport failure unchanged', async () => {
    const failure = new Error('lost response')
    requestFoundation.mockRejectedValue(failure)
    await expect(
      requestSourceMutation('/projects/p-5', 'PATCH', { a: 1 }, context, parse),
    ).rejects.toBe(failure)
  })
})
