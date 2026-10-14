/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardActivityReviewPanel } from './dashboard-activity-review-panel'

const api = vi.hoisted(() => ({ getActivity: vi.fn(), getIndicators: vi.fn() }))
const seen = vi.hoisted(() => ({
  detail: null as Record<string, unknown> | null,
  proof: null as Record<string, unknown> | null,
  opened: [] as string[],
}))

vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('@/features/projects', () => ({
  ActivityDetailPanel: (props: Record<string, unknown>) => {
    seen.detail = props
    if (props.open) seen.opened.push((props.activity as { title: string } | null)?.title ?? 'none')
    return props.open ? (
      <div data-testid="detail">
        {(props.activity as { title: string } | null)?.title ?? 'none'}
      </div>
    ) : null
  },
  ActivityProofDialog: (props: Record<string, unknown>) => {
    seen.proof = props
    return (
      <div data-testid="proof">{(props.activity as { title: string } | null)?.title ?? 'none'}</div>
    )
  },
}))

type Props = ComponentProps<typeof DashboardActivityReviewPanel>
const target = (overrides: Record<string, unknown> = {}) => ({
  projectId: 'p1',
  activityId: 'a1',
  expenseId: undefined,
  proofId: undefined,
  ...overrides,
})
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const onActivityChanged = vi.fn()
const onClose = vi.fn()
const props = (overrides: Record<string, unknown> = {}) =>
  ({
    role: 'Project Manager',
    target: target(),
    onActivityChanged,
    onClose,
    ...overrides,
  }) as unknown as Props
const show = (overrides: Record<string, unknown> = {}) =>
  render(<DashboardActivityReviewPanel {...props(overrides)} />)
const detailProps = () => seen.detail as Record<string, unknown>
const proofProps = () => seen.proof as Record<string, unknown>

describe('DashboardActivityReviewPanel', () => {
  beforeEach(() => {
    api.getActivity.mockResolvedValue({ title: 'First activity' })
    api.getIndicators.mockResolvedValue([{ id: 'indicator-1' }])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    seen.detail = seen.proof = null
    seen.opened.length = 0
  })

  it('shows nothing and reads nothing without a target', async () => {
    show({ target: null })
    await act(async () => {})

    expect(api.getActivity).not.toHaveBeenCalled()
    expect(api.getIndicators).not.toHaveBeenCalled()
    expect(screen.queryByText('Activity details')).toBeNull()
    expect(screen.queryByTestId('detail')).toBeNull()
  })

  it('reads the activity and the project indicators of the target', async () => {
    show({ target: target({ projectId: 'p9', activityId: 'a9' }) })

    await screen.findByTestId('detail')
    expect(api.getActivity).toHaveBeenCalledWith('p9', 'a9')
    expect(api.getIndicators).toHaveBeenCalledWith('p9')
    expect(detailProps()).toMatchObject({
      activity: { title: 'First activity' },
      indicators: [{ id: 'indicator-1' }],
      journeyStages: [],
      canEdit: false,
      open: true,
    })
    expect((detailProps().onEdit as () => unknown)()).toBeUndefined()
  })

  it('passes the requested expense and proof of the target', async () => {
    show({ target: target({ expenseId: 'e1', proofId: 'r1' }) })

    await screen.findByTestId('detail')
    expect(detailProps()).toMatchObject({ requestedExpenseId: 'e1', requestedProofId: 'r1' })
  })

  it.each([
    ['Project Manager', { canDecideProof: true, canDecideExtension: true }],
    ['Project Officer', { canLogExpense: true, canRequestExtension: true, canSubmitProof: true }],
    ['Monitoring and Evaluation Officer', { canValidateExpense: true, canValidateProof: true }],
    ['System Administrator', {}],
    [null, {}],
  ])('grants %s only %j', async (role, granted) => {
    show({ role })

    await screen.findByTestId('detail')
    const all = {
      canDecideProof: false,
      canDecideExtension: false,
      canLogExpense: false,
      canRequestExtension: false,
      canSubmitProof: false,
      canValidateExpense: false,
      canValidateProof: false,
    }
    expect(detailProps()).toMatchObject({ ...all, ...granted })
  })

  it('shows the loading page while the reads are pending', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    show()

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.getByText('Activity details')).toBeTruthy()
    expect(
      screen.getByText('Open the selected project activity without leaving Dashboard.'),
    ).toBeTruthy()
    expect(screen.getByText('Loading the selected activity and its submitted proof.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it.each([
    ['activity', () => api.getActivity.mockRejectedValue(new Error('down'))],
    ['indicator', () => api.getIndicators.mockRejectedValue(new Error('down'))],
  ])(
    'shows the failure when the %s read fails, and Retry reads both again',
    async (_name, fail) => {
      fail()
      show()

      expect(await screen.findByText('Review unavailable')).toBeTruthy()
      expect(
        screen.getByText('The activity proof could not be loaded. Try again from this panel.'),
      ).toBeTruthy()
      expect(screen.queryByTestId('detail')).toBeNull()
      api.getActivity.mockResolvedValue({ title: 'Second activity' })
      api.getIndicators.mockResolvedValue([])

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

      expect((await screen.findByTestId('detail')).textContent).toBe('Second activity')
      expect(api.getActivity).toHaveBeenCalledTimes(2)
      expect(api.getIndicators).toHaveBeenCalledTimes(2)
      expect(detailProps().indicators).toEqual([])
    },
  )

  it('shows the loading page again while a Retry loads', async () => {
    api.getActivity.mockRejectedValueOnce(new Error('down'))
    show()
    await screen.findByText('Review unavailable')
    api.getActivity.mockReturnValue(new Promise(() => {}))

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.queryByText('Review unavailable')).toBeNull()
  })

  it('closes from the loading page only when the sheet closes', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    show()
    await screen.findByText('Loading review')

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('reads again for a new target and ignores the answer of the old one', async () => {
    const first = deferred<{ title: string }>()
    api.getActivity.mockReturnValueOnce(first.promise)
    api.getActivity.mockResolvedValueOnce({ title: 'Second activity' })
    const view = show()

    view.rerender(
      <DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />,
    )
    expect((await screen.findByTestId('detail')).textContent).toBe('Second activity')
    await act(async () => {
      first.resolve({ title: 'Stale activity' })
    })

    expect(screen.getByTestId('detail').textContent).toBe('Second activity')
    expect(api.getActivity).toHaveBeenNthCalledWith(2, 'p1', 'a2')
  })

  it('ignores a failure that arrives after the target changed', async () => {
    const first = deferred<{ title: string }>()
    api.getActivity.mockReturnValueOnce(first.promise)
    const view = show()

    view.rerender(
      <DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />,
    )
    await screen.findByTestId('detail')
    await act(async () => {
      first.reject(new Error('late'))
    })

    expect(screen.queryByText('Review unavailable')).toBeNull()
    expect(screen.getByTestId('detail')).toBeTruthy()
  })

  it('clears the review and the proof dialog when the target goes away', async () => {
    const view = show()
    await screen.findByTestId('detail')
    act(() =>
      (detailProps().onSubmitProof as (value: unknown) => void)({ title: 'Proof activity' }),
    )

    view.rerender(<DashboardActivityReviewPanel {...props({ target: null })} />)

    await waitFor(() => expect(screen.queryByTestId('detail')).toBeNull())
    expect(screen.queryByText('Loading review')).toBeNull()
    expect(screen.queryByTestId('proof')).toBeNull()
    view.rerender(
      <DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />,
    )
    await screen.findByTestId('detail')
    expect(proofProps()).toMatchObject({ activity: null, open: false })
  })

  it('shows the loading page, not the previous activity, while a new target loads', async () => {
    const view = show()
    await screen.findByTestId('detail')
    api.getActivity.mockReturnValue(new Promise(() => {}))

    view.rerender(
      <DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />,
    )

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.queryByTestId('detail')).toBeNull()
  })

  it('never shows the closed activity again when the panel opens for a new target', async () => {
    const view = show()
    await screen.findByTestId('detail')
    view.rerender(<DashboardActivityReviewPanel {...props({ target: null })} />)
    await waitFor(() => expect(screen.queryByTestId('detail')).toBeNull())
    seen.opened.length = 0
    api.getActivity.mockReturnValue(new Promise(() => {}))

    view.rerender(
      <DashboardActivityReviewPanel {...props({ target: target({ activityId: 'a2' }) })} />,
    )

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(seen.opened).toEqual([])
  })

  it('keeps the loading page when the read answers with no activity', async () => {
    api.getActivity.mockResolvedValue(null)
    show()

    expect(await screen.findByText('Loading review')).toBeTruthy()
    await act(async () => {})
    expect(screen.queryByTestId('detail')).toBeNull()
    expect(screen.queryByText('Review unavailable')).toBeNull()
  })

  it('closes the panel when the detail panel closes and not when it opens', async () => {
    show()
    await screen.findByTestId('detail')
    ;(detailProps().onOpenChange as (open: boolean) => void)(true)
    expect(onClose).not.toHaveBeenCalled()
    ;(detailProps().onOpenChange as (open: boolean) => void)(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a changed activity and reports the change', async () => {
    show()
    await screen.findByTestId('detail')

    act(() =>
      (detailProps().onActivityChanged as (value: unknown) => void)({ title: 'Changed activity' }),
    )

    expect(screen.getByTestId('detail').textContent).toBe('Changed activity')
    expect(onActivityChanged).toHaveBeenCalledTimes(1)
  })

  it('opens the proof dialog for the activity and closes it again', async () => {
    show()
    await screen.findByTestId('detail')
    expect(proofProps()).toMatchObject({ activity: null, open: false })

    act(() =>
      (detailProps().onSubmitProof as (value: unknown) => void)({ title: 'Proof activity' }),
    )
    expect(proofProps()).toMatchObject({ activity: { title: 'Proof activity' }, open: true })

    act(() => (proofProps().onOpenChange as (open: boolean) => void)(true))
    expect(proofProps()).toMatchObject({ open: true })
    act(() => (proofProps().onOpenChange as (open: boolean) => void)(false))
    expect(proofProps()).toMatchObject({ activity: null, open: false })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the submitted activity, closes the proof dialog and reports the change', async () => {
    show()
    await screen.findByTestId('detail')
    act(() =>
      (detailProps().onSubmitProof as (value: unknown) => void)({ title: 'Proof activity' }),
    )

    act(() =>
      (proofProps().onSubmitted as (value: unknown) => void)({ title: 'Submitted activity' }),
    )

    expect(screen.getByTestId('detail').textContent).toBe('Submitted activity')
    expect(proofProps()).toMatchObject({ activity: null, open: false })
    expect(onActivityChanged).toHaveBeenCalledTimes(1)
  })
})
