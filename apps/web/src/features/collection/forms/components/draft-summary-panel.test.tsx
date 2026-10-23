/* @vitest-environment jsdom */
import { draftNeedsCheckReasons } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DraftSummaryPanel } from './draft-summary-panel'

afterEach(cleanup)

const summary = {
  addedFields: ['household_size'],
  sourceNamesAdded: ['sex'],
  optionsAdded: ['civil_status'],
  aliasesAdded: 4,
  defaults: ['registration_operation'],
  rules: ['age_at_registration'],
  needsCheck: [
    { fieldCode: 'sex', reason: 'SUGGESTED_SOURCE_NAME' as const },
    { fieldCode: 'consent_recorded', reason: 'PARTICIPATION_CONSENT_NO_SOURCE' as const },
  ],
}

describe('DraftSummaryPanel', () => {
  it('needs check items are listed first', () => {
    render(<DraftSummaryPanel summary={summary} onSelectField={vi.fn()} />)
    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent)
    expect(headings).toEqual(['Draft from import', 'Needs check (2)', 'Changes in this draft'])
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('sex')
  })

  it('links each needs check item to its field in plain words', () => {
    const onSelectField = vi.fn()
    render(<DraftSummaryPanel summary={summary} onSelectField={onSelectField} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to consent_recorded' }))
    expect(onSelectField).toHaveBeenCalledWith('consent_recorded')
    expect(screen.getByText(/no participation consent column/i)).toBeTruthy()
  })

  it('never shows a raw reason code', () => {
    render(
      <DraftSummaryPanel
        summary={{
          ...summary,
          needsCheck: draftNeedsCheckReasons.map((reason) => ({ fieldCode: 'x', reason })),
        }}
        onSelectField={vi.fn()}
      />,
    )
    expect(document.body.textContent).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
  })

  it('counts what the draft added and says so when nothing needs a check', () => {
    render(<DraftSummaryPanel summary={{ ...summary, needsCheck: [] }} onSelectField={vi.fn()} />)
    expect(screen.getByText('Nothing needs a second look.')).toBeTruthy()
    expect(screen.getByText(/household_size/)).toBeTruthy()
    expect(screen.getByText(/4 value aliases/)).toBeTruthy()
  })
})
