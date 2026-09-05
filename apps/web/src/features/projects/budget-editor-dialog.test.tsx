/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { BudgetRecord } from '@/types/pathways'

import { BudgetEditorDialog } from './budget-editor-dialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const budget: BudgetRecord = {
  actualSpending: 2_562_000,
  id: 'budget-fm',
  plannedAmount: 4_200_000,
  projectId: 'futuremakers-ncr',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BudgetEditorDialog', () => {
  it('cancels without mutation and restores focus to the action', async () => {
    const update = vi.spyOn(pathwaysClient, 'updateBudgetAllocation')
    render(<BudgetEditorDialog budget={budget} onSaved={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Modify budget' })
    fireEvent.click(trigger)
    fireEvent.change(screen.getByLabelText(/Planned allocation/), {
      target: { value: '3900000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(update).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('saves the valid planned allocation and leaves actual spending as read-only context', async () => {
    const updated = { ...budget, plannedAmount: 4_500_000 }
    const update = vi.spyOn(pathwaysClient, 'updateBudgetAllocation').mockResolvedValueOnce(updated)
    const onSaved = vi.fn()
    render(<BudgetEditorDialog budget={budget} onSaved={onSaved} />)

    const trigger = screen.getByRole('button', { name: 'Modify budget' })
    fireEvent.click(trigger)
    expect(screen.getByText('₱2,562,000')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Planned allocation/), {
      target: { value: '4500000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        plannedAmount: 4_500_000,
        projectId: 'futuremakers-ncr',
      }),
    )
    expect(onSaved).toHaveBeenCalledWith(updated)
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('keeps the dialog and entered value available after a failed save', async () => {
    vi.spyOn(pathwaysClient, 'updateBudgetAllocation').mockRejectedValueOnce(
      new Error('Prototype persistence failed.'),
    )
    render(<BudgetEditorDialog budget={budget} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modify budget' }))
    const allocation = screen.getByLabelText(/Planned allocation/) as HTMLInputElement
    fireEvent.change(allocation, { target: { value: '4500000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The planned allocation could not be saved. Check the value and try again.',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(allocation.value).toBe('4500000')
  })

  it('locks dismiss and duplicate actions while a save is pending', async () => {
    let resolveUpdate: ((value: BudgetRecord) => void) | undefined
    vi.spyOn(pathwaysClient, 'updateBudgetAllocation').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve
        }),
    )
    render(<BudgetEditorDialog budget={budget} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modify budget' }))
    fireEvent.change(screen.getByLabelText(/Planned allocation/), {
      target: { value: '4500000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))

    const pendingAction = await screen.findByRole('button', { name: 'Saving budget...' })
    expect((pendingAction as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(true)

    resolveUpdate?.({ ...budget, plannedAmount: 4_500_000 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
