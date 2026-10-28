/* @vitest-environment jsdom */
import { draftNeedsCheckReasons } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FormField } from '../../collection.utils'
import { emptyIntake } from '../digital-form-contract'
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
    render(<DraftSummaryPanel summary={summary} fields={[]} onSelectField={vi.fn()} />)
    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent)
    expect(headings).toEqual(['Draft from import', 'Needs check (2)', 'Changes in this draft'])
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('sex')
  })

  it('links each needs check item to its field in plain words', () => {
    const onSelectField = vi.fn()
    render(<DraftSummaryPanel summary={summary} fields={[]} onSelectField={onSelectField} />)
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
        fields={[]}
        onSelectField={vi.fn()}
      />,
    )
    expect(document.body.textContent).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
  })

  it('lists each changed field once by its label with a tag per change', () => {
    const field = (code: string, label: string): FormField => ({
      id: code,
      label,
      code,
      type: 'text',
      required: false,
      metadataKey: false,
      sadddField: false,
      allowedValues: [],
      minimumValue: '',
      maximumValue: '',
      minimumLength: '',
      maximumLength: '',
      mappingStatus: 'mapped',
      ...emptyIntake,
    })
    const onSelectField = vi.fn()
    render(
      <DraftSummaryPanel
        summary={{ ...summary, sourceNamesAdded: ['sex', 'household_size'] }}
        fields={[field('household_size', 'Household size'), field('sex', 'Sex')]}
        onSelectField={onSelectField}
      />,
    )
    expect(screen.getByText('Show changed fields (5)')).toBeTruthy()
    const row = screen.getByRole('button', { name: 'Household size' }).closest('tr') as HTMLElement
    expect(within(row).getByText('household_size')).toBeTruthy()
    expect(within(row).getByText('New')).toBeTruthy()
    expect(within(row).getByText('Source names')).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Household size' }))
    expect(onSelectField).toHaveBeenCalledWith('household_size')
  })

  it('counts what the draft added and says so when nothing needs a check', () => {
    render(
      <DraftSummaryPanel
        summary={{ ...summary, needsCheck: [] }}
        fields={[]}
        onSelectField={vi.fn()}
      />,
    )
    expect(screen.getByText('Nothing needs a second look.')).toBeTruthy()
    expect(screen.getByText(/household_size/)).toBeTruthy()
    expect(screen.getByText(/4 value aliases/)).toBeTruthy()
  })
})
