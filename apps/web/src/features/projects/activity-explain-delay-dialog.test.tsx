/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const api = vi.hoisted(() => ({ recordOverdueExplanation: vi.fn() }))
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/components/pathways', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
// Native <select> stand-in: real Radix Select portals/pointer-events are unnecessary here,
// this dialog only needs onValueChange to fire with the chosen category.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: ReactNode
    disabled?: boolean
    onValueChange: (value: string) => void
    value: string
  }) => (
    <select
      aria-label="Category"
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      <option value="">Select a category</option>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}))

import { PathwaysClientError } from '@/lib/services/pathways-client'
import { ActivityExplainDelayDialog } from './activity-explain-delay-dialog'

const activity = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
} as Activity

const renderDialog = (open = true) =>
  render(
    <ActivityExplainDelayDialog
      activity={activity}
      onOpenChange={vi.fn()}
      onRecorded={vi.fn()}
      open={open}
    />,
  )
const category = () => screen.getByLabelText('Category') as HTMLSelectElement
const textarea = () => screen.getByLabelText(/Explanation/) as HTMLTextAreaElement
const save = () => screen.getByRole('button', { name: /Save/ })
const fill = (explanation: string, categoryValue = 'WEATHER') => {
  fireEvent.change(category(), { target: { value: categoryValue } })
  fireEvent.change(textarea(), { target: { value: explanation } })
  fireEvent.click(save())
}

describe('ActivityExplainDelayDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  it('rejects a category-less submission before calling the API', async () => {
    renderDialog()
    fireEvent.change(textarea(), { target: { value: 'A valid enough explanation here.' } })
    fireEvent.click(save())
    expect(screen.getByRole('alert').textContent).toBe('Select a category.')
    expect(api.recordOverdueExplanation).not.toHaveBeenCalled()
  })

  it('rejects an explanation shorter than 10 characters', async () => {
    renderDialog()
    fill('too short')
    expect(screen.getByRole('alert').textContent).toContain('10 to 2000 characters')
    expect(api.recordOverdueExplanation).not.toHaveBeenCalled()
  })

  it('rejects an explanation longer than 2000 characters', async () => {
    renderDialog()
    fill('x'.repeat(2001))
    expect(screen.getByRole('alert').textContent).toContain('10 to 2000 characters')
    expect(api.recordOverdueExplanation).not.toHaveBeenCalled()
  })

  it('does not submit the form when Enter is pressed inside the textarea', () => {
    renderDialog()
    fireEvent.change(category(), { target: { value: 'WEATHER' } })
    fireEvent.change(textarea(), { target: { value: 'A valid enough explanation here.' } })
    fireEvent.keyDown(textarea(), { key: 'Enter', code: 'Enter' })
    expect(api.recordOverdueExplanation).not.toHaveBeenCalled()
  })

  it('records a valid explanation and reports success', async () => {
    api.recordOverdueExplanation.mockResolvedValueOnce(activity)
    renderDialog()
    fill('A synthetic weather delay explanation for testing.')
    await waitFor(() => expect(api.recordOverdueExplanation).toHaveBeenCalledTimes(1))
    expect(api.recordOverdueExplanation.mock.calls[0][0]).toMatchObject({
      projectId: activity.projectId,
      activityId: activity.id,
      category: 'WEATHER',
      explanation: 'A synthetic weather delay explanation for testing.',
    })
  })

  it('shows a 409 rejection message as text', async () => {
    api.recordOverdueExplanation.mockRejectedValueOnce(
      new PathwaysClientError('The activity is not currently overdue.', 'invalid', [], 409),
    )
    renderDialog()
    fill('A synthetic weather delay explanation for testing.')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('The activity is not currently overdue.'),
    )
  })

  it('shows a 403 rejection message as text', async () => {
    api.recordOverdueExplanation.mockRejectedValueOnce(
      new PathwaysClientError('Permission denied.', 'forbidden', [], 403),
    )
    renderDialog()
    fill('A synthetic weather delay explanation for testing.')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Permission denied.'))
  })

  it('reuses the same clientMutationId on retry after an indeterminate failure', async () => {
    api.recordOverdueExplanation.mockRejectedValue(
      new PathwaysClientError('Unavailable.', 'network', [], 503),
    )
    renderDialog()
    fill('A synthetic weather delay explanation for testing.')
    await waitFor(() => expect(api.recordOverdueExplanation).toHaveBeenCalledTimes(1))
    fireEvent.click(save())
    await waitFor(() => expect(api.recordOverdueExplanation).toHaveBeenCalledTimes(2))
    const [first, second] = api.recordOverdueExplanation.mock.calls.map(
      ([input]) => input.clientMutationId,
    )
    expect(second).toBe(first)
  })

  it('draws a fresh clientMutationId after a definitive rejection, and again on reopen', async () => {
    api.recordOverdueExplanation.mockRejectedValueOnce(
      new PathwaysClientError('Rejected.', 'invalid', [], 400),
    )
    api.recordOverdueExplanation.mockResolvedValueOnce(activity)
    renderDialog()
    fill('A synthetic weather delay explanation for testing.')
    await waitFor(() => expect(api.recordOverdueExplanation).toHaveBeenCalledTimes(1))
    fireEvent.click(save())
    await waitFor(() => expect(api.recordOverdueExplanation).toHaveBeenCalledTimes(2))
    const [first, second] = api.recordOverdueExplanation.mock.calls.map(
      ([input]) => input.clientMutationId,
    )
    expect(second).not.toBe(first)
  })
})
