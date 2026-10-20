/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  action,
  api,
  dashboard,
  item,
  panels,
  resetRoleDashboardMocks,
  section,
} from '@/test/fixtures/role-dashboard-fixtures'

import { RoleDashboard } from './role-dashboard'

const open = async (href = '/projects/p1/activities/a1?review=r1') => {
  api.getDashboard.mockResolvedValue(
    dashboard({
      sections: [
        section({
          items: [
            item({ primaryAction: action({ id: 'review-proof', label: 'Review proof', href }) }),
          ],
        }),
      ],
    }),
  )
  render(<RoleDashboard />)
  const trigger = await screen.findByRole('button', { name: 'Review proof' })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}
const detail = () => screen.findByTestId('activity-detail')

describe('Role dashboard activity review panel', () => {
  beforeEach(() => {
    resetRoleDashboardMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads the activity and its project indicators, then shows the activity panel', async () => {
    api.getIndicators.mockResolvedValue([{ id: 'indicator-1' }])
    await open()

    expect((await detail()).textContent).toContain('Synthetic activity')
    expect(api.getActivity).toHaveBeenCalledWith('p1', 'a1')
    expect(api.getIndicators).toHaveBeenCalledWith('p1')
    expect(panels.detail).toMatchObject({
      indicators: [{ id: 'indicator-1' }],
      journeyStages: [],
      open: true,
      canEdit: false,
      requestedProofId: 'r1',
      requestedExpenseId: undefined,
    })
  })

  it.each([
    ['?expense=e1', undefined, 'e1'],
    ['?review=r1&proof=p2', 'r1', undefined],
    ['?proof=p2', 'p2', undefined],
    ['', undefined, undefined],
  ])('passes the requested proof and expense of %s', async (query, proofId, expenseId) => {
    await open(`/projects/p1/activities/a1${query}`)
    await detail()

    expect(panels.detail).toMatchObject({
      requestedProofId: proofId,
      requestedExpenseId: expenseId,
    })
  })

  it('grants an administrator none of the activity decisions', async () => {
    await open()
    await detail()

    expect(panels.detail).toMatchObject({
      canDecideProof: false,
      canDecideExtension: false,
      canEdit: false,
      canLogExpense: false,
      canRequestExtension: false,
      canSubmitProof: false,
      canValidateExpense: false,
      canValidateProof: false,
    })
  })

  it('shows the loading page while the activity loads', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    await open()

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.getByText('Loading the selected activity and its submitted proof.')).toBeTruthy()
    expect(screen.queryByTestId('activity-detail')).toBeNull()
  })

  it('shows the review unavailable page for a failed read and loads again on Retry', async () => {
    api.getActivity.mockRejectedValueOnce(new Error('down'))
    await open()

    expect(await screen.findByText('Review unavailable')).toBeTruthy()
    expect(
      screen.getByText('The activity proof could not be loaded. Try again from this panel.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('activity-detail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await detail()).textContent).toContain('Synthetic activity')
    expect(api.getActivity).toHaveBeenCalledTimes(2)
  })

  it('shows the loading page again while a Retry loads', async () => {
    api.getActivity.mockRejectedValueOnce(new Error('down'))
    await open()
    await screen.findByText('Review unavailable')
    api.getActivity.mockReturnValue(new Promise(() => {}))

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Loading review')).toBeTruthy()
    expect(screen.queryByText('Review unavailable')).toBeNull()
  })

  it('shows the failure when the indicators cannot be read', async () => {
    api.getIndicators.mockRejectedValueOnce(new Error('down'))
    await open()

    expect(await screen.findByText('Review unavailable')).toBeTruthy()
  })

  it('has no Retry while it loads', async () => {
    api.getActivity.mockReturnValue(new Promise(() => {}))
    await open()
    await screen.findByText('Loading review')

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('closes the panel and returns focus to the button that opened it', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
    const trigger = await open()
    await detail()
    trigger.blur()

    fireEvent.click(screen.getByRole('button', { name: 'close detail' }))

    await waitFor(() => expect(screen.queryByTestId('activity-detail')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('reloads the dashboard and then the activity after the activity changed', async () => {
    await open()
    await detail()

    fireEvent.click(screen.getByRole('button', { name: 'change activity' }))

    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.getActivity).toHaveBeenCalledTimes(2))
    expect((await detail()).textContent).toContain('Synthetic activity')
  })

  it('shows the unavailable page when the reload after a change fails', async () => {
    await open()
    await detail()
    api.getDashboard.mockRejectedValue(new Error('down'))

    fireEvent.click(screen.getByRole('button', { name: 'change activity' }))

    expect(await screen.findByText('Dashboard data unavailable')).toBeTruthy()
  })

  it('opens the proof dialog for the activity and closes it again', async () => {
    await open()
    await detail()
    expect(screen.queryByTestId('proof-dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'submit proof' }))
    expect(screen.getByTestId('proof-dialog').textContent).toContain('Synthetic activity')

    fireEvent.click(screen.getByRole('button', { name: 'close proof' }))
    expect(screen.queryByTestId('proof-dialog')).toBeNull()
  })

  it('closes the proof dialog together with the activity panel', async () => {
    await open()
    await detail()
    fireEvent.click(screen.getByRole('button', { name: 'submit proof' }))
    expect(screen.getByTestId('proof-dialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'close detail' }))

    await waitFor(() => expect(screen.queryByTestId('proof-dialog')).toBeNull())
  })

  it('closes the proof dialog and reloads the dashboard after a proof was submitted', async () => {
    await open()
    await detail()
    fireEvent.click(screen.getByRole('button', { name: 'submit proof' }))

    fireEvent.click(screen.getByRole('button', { name: 'proof submitted' }))

    await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('proof-dialog')).toBeNull())
  })

  it('shows no panel before an action asks for one', async () => {
    api.getDashboard.mockResolvedValue(dashboard({ sections: [section()] }))
    render(<RoleDashboard />)
    await screen.findByText('Synthetic item')
    await act(async () => {})

    expect(api.getActivity).not.toHaveBeenCalled()
    expect(screen.queryByText('Loading review')).toBeNull()
  })
})
