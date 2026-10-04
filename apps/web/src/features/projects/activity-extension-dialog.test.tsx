/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const api = vi.hoisted(() => ({ requestActivityExtension: vi.fn() }))
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

import { ActivityExtensionDialog, nextDay } from './activity-extension-dialog'

const activity = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
  dueDate: '2026-11-30',
} as Activity

const dateInput = () => screen.getByLabelText('New end date') as HTMLInputElement
const reason = () => screen.getByLabelText('Reason') as HTMLTextAreaElement
const fill = (date: string, text: string) => {
  fireEvent.change(dateInput(), { target: { value: date } })
  fireEvent.change(reason(), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Request/ }))
}

describe('ActivityExtensionDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  const renderDialog = (onRequested = vi.fn()) =>
    render(
      <ActivityExtensionDialog
        activity={activity}
        onOpenChange={vi.fn()}
        onRequested={onRequested}
        open
      />,
    )

  it('limits the date picker to the day after the current planned end', () => {
    renderDialog()
    expect(dateInput().min).toBe('2026-12-01')
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
  })

  it('rejects a date that is not later than the current end', () => {
    renderDialog()
    fill('2026-11-30', 'Rains delayed the delivery partner.')
    expect(screen.getByRole('alert').textContent).toContain('after the current planned end')
    expect(api.requestActivityExtension).not.toHaveBeenCalled()
  })

  it('rejects a reason shorter than 10 characters', () => {
    renderDialog()
    fill('2026-12-15', 'too short')
    expect(screen.getByRole('alert').textContent).toContain('10 to 2000 characters')
    expect(api.requestActivityExtension).not.toHaveBeenCalled()
  })

  it('posts the date, trimmed reason and a client mutation id', async () => {
    const onRequested = vi.fn()
    api.requestActivityExtension.mockResolvedValueOnce({})
    renderDialog(onRequested)
    fill('2026-12-15', '  Rains delayed the delivery partner.  ')
    await waitFor(() => expect(onRequested).toHaveBeenCalled())
    const [projectId, activityId, body] = api.requestActivityExtension.mock.calls[0]
    expect([projectId, activityId]).toEqual([activity.projectId, activity.id])
    expect(body).toMatchObject({
      requestedEndDate: '2026-12-15',
      reason: 'Rains delayed the delivery partner.',
    })
    expect(body.clientMutationId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
