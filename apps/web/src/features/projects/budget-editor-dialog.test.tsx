/* @vitest-environment jsdom */

import type { BudgetRecord } from '@/types/pathways'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BudgetEditorDialog } from './budget-editor-dialog'

afterEach(cleanup)

describe('BudgetEditorDialog', () => {
  it('keeps the budget action unavailable while there is no real allocation endpoint', () => {
    const budget: BudgetRecord = {
      actualSpending: 0,
      id: 'budget-project',
      plannedAmount: 0,
      projectId: 'project-id',
    }
    const onSaved = vi.fn()
    render(<BudgetEditorDialog budget={budget} onSaved={onSaved} />)
    expect(
      (screen.getByRole('button', { name: 'Modify budget' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
