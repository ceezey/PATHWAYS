/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const api = vi.hoisted(() => ({ recordActivityProgress: vi.fn() }))
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

import { PathwaysClientError } from '@/lib/services/pathways-client'
import { ActivityProgressDialog } from './activity-progress-dialog'

const activity = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
  progress: 20,
} as Activity

const renderDialog = () =>
  render(
    <ActivityProgressDialog activity={activity} onOpenChange={vi.fn()} onRecorded={vi.fn()} open />,
  )
const percent = () => screen.getByLabelText('Progress (%)') as HTMLInputElement
const note = () => screen.getByLabelText(/Progress note/) as HTMLTextAreaElement
const fill = (value: string) => {
  fireEvent.change(percent(), { target: { value } })
  fireEvent.change(note(), { target: { value: 'Synthetic progress note' } })
  fireEvent.click(screen.getByRole('button', { name: /Record progress/ }))
}

describe('ActivityProgressDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  it('blocks 100% on the client and points to proof submission', () => {
    renderDialog()
    expect(percent().max).toBe('99')
    fill('100')
    expect(screen.getByRole('alert').textContent).toContain('Submit Update & Proof')
    expect(api.recordActivityProgress).not.toHaveBeenCalled()
  })

  it.each([400, 409])(
    're-enables inputs and uses a fresh id after a definitive %s rejection',
    async (status) => {
      api.recordActivityProgress.mockRejectedValueOnce(
        new PathwaysClientError('Rejected.', 'invalid', [], status),
      )
      renderDialog()
      fill('40')
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Rejected.'))
      expect(percent().disabled).toBe(false)
      expect(note().disabled).toBe(false)
      api.recordActivityProgress.mockRejectedValueOnce(new Error('again'))
      fireEvent.click(screen.getByRole('button', { name: /Record progress/ }))
      await waitFor(() => expect(api.recordActivityProgress).toHaveBeenCalledTimes(2))
      const [first, second] = api.recordActivityProgress.mock.calls.map(
        ([input]) => input.clientUpdateId,
      )
      expect(second).not.toBe(first)
    },
  )

  it('keeps the inputs locked and replays the same id after an indeterminate failure', async () => {
    api.recordActivityProgress.mockRejectedValue(
      new PathwaysClientError('Unavailable.', 'network', [], 503),
    )
    renderDialog()
    fill('40')
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(percent().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Record progress/ }))
    await waitFor(() => expect(api.recordActivityProgress).toHaveBeenCalledTimes(2))
    const [first, second] = api.recordActivityProgress.mock.calls.map(
      ([input]) => input.clientUpdateId,
    )
    expect(second).toBe(first)
  })
})
