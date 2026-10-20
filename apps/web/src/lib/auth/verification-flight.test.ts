import { describe, expect, it, vi } from 'vitest'
import { VerificationCancelled, createVerificationFlight } from './verification-flight'

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('owner-scoped verification coordination', () => {
  it('shares only identical in-flight work, not completed authorization', async () => {
    const owner = createVerificationFlight<number>()
    const pending = deferred<number>()
    const load = vi.fn(() => pending.promise)
    const first = owner.run('same-subject-token-context', load)
    expect(owner.run('same-subject-token-context', load)).toBe(first)
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    pending.resolve(7)
    await expect(first).resolves.toBe(7)
    await expect(owner.run('same-subject-token-context', load)).resolves.toBe(7)
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('rejects a late response from a superseded token even if the transport ignores abort', async () => {
    const owner = createVerificationFlight<number>()
    const pending = deferred<number>()
    let signal: AbortSignal | undefined
    const first = owner.run('old-token', (value) => {
      signal = value
      return pending.promise
    })
    const rejected = expect(first).rejects.toBeInstanceOf(VerificationCancelled)
    await Promise.resolve()
    await expect(owner.run('new-token', async () => 2)).resolves.toBe(2)
    expect(signal?.aborted).toBe(true)
    pending.resolve(1)
    await rejected
  })
  it('cancels before a Strict Mode-style effect replay can start obsolete work', async () => {
    const owner = createVerificationFlight<number>()
    const load = vi.fn(async () => 1)
    const abandoned = owner.run('identity', load)
    const rejected = expect(abandoned).rejects.toBeInstanceOf(VerificationCancelled)
    owner.cancel()
    await expect(owner.run('identity', load)).resolves.toBe(1)
    await rejected
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('releases failed work so an explicit retry runs again', async () => {
    const owner = createVerificationFlight<number>()
    const load = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(1)
    await expect(owner.run('identity', load)).rejects.toThrow('unavailable')
    await expect(owner.run('identity', load)).resolves.toBe(1)
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('does not let completion of an old request clear newer in-flight work', async () => {
    const owner = createVerificationFlight<number>()
    const old = deferred<number>()
    const next = deferred<number>()
    const abandoned = owner.run('old', () => old.promise)
    const rejected = expect(abandoned).rejects.toBeInstanceOf(VerificationCancelled)
    await Promise.resolve()
    const current = owner.run('new', () => next.promise)
    old.resolve(1)
    await rejected
    expect(owner.run('new', async () => 3)).toBe(current)
    next.resolve(2)
    await expect(current).resolves.toBe(2)
  })
  it('never shares work between provider instances', async () => {
    const load = vi.fn(async () => 1)
    await Promise.all([
      createVerificationFlight<number>().run('same', load),
      createVerificationFlight<number>().run('same', load),
    ])
    expect(load).toHaveBeenCalledTimes(2)
  })
})
