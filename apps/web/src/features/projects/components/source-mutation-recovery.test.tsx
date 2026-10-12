import { sourceMutationTickets } from '@/lib/services/source-mutation'
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ server: vi.fn() }))
vi.mock('@/lib/services/pathways-client', async () => {
  const { sourceMutationTickets } = await import('@/lib/services/source-mutation')
  return {
    recoverSourceMutation: (
      context: Parameters<typeof sourceMutationTickets.recover>[0],
      operation: string,
    ) => sourceMutationTickets.recover(context, operation, state.server),
  }
})
import { SourceMutationRecovery } from './source-mutation-recovery'
const operation = 'PATCH:/projects/20000000-0000-4000-8000-000000000001'
const prefix = '/projects/20000000-0000-4000-8000-000000000001'
const context = { principalKey: 'synthetic', isCurrent: () => true }
const prepare = async () => {
  await expect(
    sourceMutationTickets.execute(
      context,
      operation,
      { title: 'Synthetic' },
      async () => {
        throw Error('response lost')
      },
      (value) => value,
    ),
  ).rejects.toThrow()
}
beforeEach(() => {
  sourceMutationTickets.clear()
  state.server
    .mockReset()
    .mockImplementation(async ({ requestId }) => ({ requestId, abandoned: true }))
})
afterEach(cleanup)
describe('explicit source recovery controls', () => {
  it('gives a new owner independent recovery controls while the discarded old-owner request is still pending', async () => {
    let oldLive = true
    let resolveOld: ((value: unknown) => void) | undefined
    const firstOwner = { ...context, isCurrent: () => oldLive }
    await expect(
      sourceMutationTickets.execute(
        firstOwner,
        operation,
        { title: 'A' },
        async () => {
          throw Error('uncertain')
        },
        (value) => value,
      ),
    ).rejects.toThrow()
    const oldRequestId = sourceMutationTickets.pendingRecovery(firstOwner, operation)?.requestId
    state.server.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const oldApplied = vi.fn()
    const newApplied = vi.fn()
    const view = render(
      <SourceMutationRecovery
        context={firstOwner}
        prefix={prefix}
        onRecovered={async () => oldApplied}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check outcome and reload' }))
    await waitFor(() => expect(state.server).toHaveBeenCalledOnce())
    oldLive = false
    const nextOwner = { ...context, principalKey: 'synthetic-B' }
    await act(async () => {
      await expect(
        sourceMutationTickets.execute(
          nextOwner,
          operation,
          { title: 'B' },
          async () => {
            throw Error('uncertain')
          },
          (value) => value,
        ),
      ).rejects.toThrow()
    })
    view.rerender(
      <SourceMutationRecovery
        context={nextOwner}
        prefix={prefix}
        onRecovered={async () => newApplied}
      />,
    )
    const recovery = screen.getByRole('button', {
      name: 'Check outcome and reload',
    }) as HTMLButtonElement
    expect(recovery.disabled).toBe(false)
    fireEvent.click(recovery)
    await waitFor(() => expect(newApplied).toHaveBeenCalledOnce())
    expect(sourceMutationTickets.pendingRecovery(nextOwner, operation)).toBeNull()
    await act(async () => resolveOld?.({ requestId: oldRequestId, abandoned: true }))
    expect(oldApplied).not.toHaveBeenCalled()
    expect(newApplied).toHaveBeenCalledOnce()
  })
  it('does not advertise generic abandonment for an uncertain multipart proof under the broad activity prefix', async () => {
    const key = `POST:${prefix}/activities/20000000-0000-4000-8000-000000000002/updates`
    await expect(
      sourceMutationTickets.execute(
        context,
        key,
        { note: 'Synthetic' },
        async () => {
          throw Error('response lost')
        },
        (value) => value,
      ),
    ).rejects.toThrow()
    render(
      <SourceMutationRecovery
        context={context}
        prefix={`${prefix}/activities`}
        onRecovered={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Check outcome and reload' })).toBeNull()
    expect(sourceMutationTickets.pendingRecovery(context, key)).not.toBeNull()
    expect(state.server).not.toHaveBeenCalled()
  })
  it('does not permit edited input until certified outcome and fresh authorized reload both succeed', async () => {
    await prepare()
    let finishReload: (() => void) | undefined
    const applied = vi.fn()
    const reload = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          finishReload = () => resolve(applied)
        }),
    )
    render(<SourceMutationRecovery context={context} prefix={prefix} onRecovered={reload} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check outcome and reload' }))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(sourceMutationTickets.pendingRecovery(context, operation)).not.toBeNull()
    await expect(
      sourceMutationTickets.execute(
        context,
        operation,
        { title: 'Changed' },
        async () => ({}),
        (value) => value,
      ),
    ).rejects.toThrow('finish recovery')
    if (!finishReload) throw Error('Missing reload continuation')
    await act(async () => finishReload?.())
    expect(applied).toHaveBeenCalledOnce()
    expect(sourceMutationTickets.pendingRecovery(context, operation)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check outcome and reload' })).toBeNull()
  })
  it('retains certified recovery on failed reload and retries only the reload, without another abandonment request', async () => {
    await prepare()
    const applied = vi.fn()
    const reload = vi
      .fn()
      .mockRejectedValueOnce(Error('reload unavailable'))
      .mockResolvedValueOnce(applied)
    render(<SourceMutationRecovery context={context} prefix={prefix} onRecovered={reload} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check outcome and reload' }))
    await screen.findByRole('alert')
    expect(sourceMutationTickets.pendingRecovery(context, operation)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check outcome and reload' }))
    await waitFor(() => expect(applied).toHaveBeenCalledOnce())
    expect(state.server).toHaveBeenCalledOnce()
    expect(sourceMutationTickets.pendingRecovery(context, operation)).toBeNull()
  })
  it('discards a reload continuation after unmount without applying its old callback or releasing the unresolved ticket', async () => {
    await prepare()
    let finishReload: (() => void) | undefined
    const applied = vi.fn()
    const reload = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          finishReload = () => resolve(applied)
        }),
    )
    const view = render(
      <SourceMutationRecovery context={context} prefix={prefix} onRecovered={reload} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Check outcome and reload' }))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    view.unmount()
    await act(async () => finishReload?.())
    expect(applied).not.toHaveBeenCalled()
    expect(sourceMutationTickets.pendingRecovery(context, operation)).not.toBeNull()
  })
})
