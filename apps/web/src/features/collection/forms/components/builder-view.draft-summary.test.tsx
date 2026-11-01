/* @vitest-environment jsdom */
import type { DraftSummaryResponse } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FormField } from '../../collection.utils'
import { initialFields } from '../forms.utils'
import { BuilderView } from './builder-view'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

vi.mock('./journey-stage-selector', () => ({ JourneyStageSelector: () => null }))

const summary: DraftSummaryResponse = {
  addedFields: ['attendance_status'],
  sourceNamesAdded: [],
  optionsAdded: [],
  aliasesAdded: 0,
  defaults: [],
  rules: [],
  needsCheck: [{ fieldCode: 'beneficiary_id', reason: 'ENUM_ANSWER_UNRESOLVED' }],
}

const view = (
  draftSummary: DraftSummaryResponse | null,
  setSelectedFieldId = vi.fn(),
  { onConfirmCheck = vi.fn(), readOnly = false, selectedFieldId = '' } = {},
) =>
  render(
    <BuilderView
      addField={vi.fn()}
      canManage
      canPublish={false}
      deleteField={vi.fn()}
      draftSummary={draftSummary}
      fields={initialFields}
      formTitle="Registration"
      formType="OTHER"
      journeyStage=""
      linkedActivityId=""
      metadataCount={0}
      metadataCoverage={0}
      mappedCount={0}
      mode="scratch"
      moveField={vi.fn()}
      onConfirmCheck={onConfirmCheck}
      onPublish={vi.fn()}
      projectActivities={[]}
      projects={[]}
      projectsLoaded
      projectId=""
      readOnly={readOnly}
      sadddCount={0}
      selectedFieldId={selectedFieldId}
      selectedProject="No project selected"
      setFormTitle={vi.fn()}
      setFormType={vi.fn()}
      setJourneyStage={vi.fn()}
      setLinkedActivityId={vi.fn()}
      setProjectId={vi.fn()}
      setSaveDialogOpen={vi.fn()}
      setSelectedFieldId={setSelectedFieldId}
      updateField={vi.fn()}
    />,
  )

describe('BuilderView draft summary', () => {
  it('shows the summary and flags the fields it names', () => {
    const setSelectedFieldId = vi.fn()
    view(summary, setSelectedFieldId)
    expect(screen.getByRole('heading', { name: 'Draft from import' })).toBeTruthy()
    expect(screen.getByText('Added from import')).toBeTruthy()
    expect(screen.getAllByText('Needs check').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Go to beneficiary_id' }))
    expect(setSelectedFieldId).toHaveBeenCalledWith(
      initialFields.find((field) => field.code === 'beneficiary_id')?.id,
    )
  })

  it('offers Confirm only on a field that needs a check, and only while editable', () => {
    const onConfirmCheck = vi.fn()
    view(summary, vi.fn(), { onConfirmCheck })
    const label = initialFields.find((field) => field.code === 'beneficiary_id')?.label
    const confirm = screen.getByRole('button', { name: `Confirm ${label}` })
    expect(confirm.getAttribute('title')).toBe('Confirm the field')
    expect(screen.getAllByRole('button', { name: /^Confirm / })).toHaveLength(1)
    fireEvent.click(confirm)
    expect(onConfirmCheck).toHaveBeenCalledWith('beneficiary_id')
    cleanup()
    view(summary, vi.fn(), { readOnly: true })
    expect(screen.queryByRole('button', { name: /^Confirm / })).toBeNull()
  })

  it.each([
    ['ENUM_ANSWER_UNRESOLVED', true],
    ['PARTICIPATION_CONSENT_NO_SOURCE', true],
    ['CONSENT_SOURCE_PROPOSED', true],
    ['WASHINGTON_GROUP_FLAG_DISAGREES', true],
  ] as const)('opens Advanced Configuration for %s: %s', (reason, open) => {
    const field = initialFields[0]
    view({ ...summary, needsCheck: [{ fieldCode: field.code, reason }] }, vi.fn(), {
      selectedFieldId: field.id,
    })
    const details = screen.getByText('Advanced Configuration (Import Metadata)').closest('details')
    expect(details?.open).toBe(open)
  })

  it('leaves Advanced Configuration closed on a field with no item', () => {
    const field = initialFields[0]
    view({ ...summary, needsCheck: [] }, vi.fn(), { selectedFieldId: field.id })
    expect(
      screen.getByText('Advanced Configuration (Import Metadata)').closest('details')?.open,
    ).toBe(false)
  })

  describe('Go to field', () => {
    const choice: FormField = {
      ...initialFields[0],
      id: 'choice-field',
      code: 'civil_status',
      label: 'Civil status',
      type: 'single_select',
      allowedValues: ['Single'],
    }
    const fields = [initialFields[0], choice]
    const Workspace = ({
      needsCheck,
      readOnly = false,
      startOn = '',
    }: {
      needsCheck: DraftSummaryResponse['needsCheck']
      readOnly?: boolean
      startOn?: string
    }) => {
      const [selectedFieldId, setSelectedFieldId] = useState(startOn)
      return (
        <BuilderView
          addField={vi.fn()}
          canManage
          canPublish={false}
          deleteField={vi.fn()}
          draftSummary={{ ...summary, addedFields: ['civil_status'], needsCheck }}
          fields={fields}
          formTitle="Registration"
          formType="OTHER"
          journeyStage=""
          linkedActivityId=""
          metadataCount={0}
          metadataCoverage={0}
          mappedCount={0}
          mode="scratch"
          moveField={vi.fn()}
          onConfirmCheck={vi.fn()}
          onPublish={vi.fn()}
          projectActivities={[]}
          projects={[]}
          projectsLoaded
          projectId=""
          readOnly={readOnly}
          sadddCount={0}
          selectedFieldId={selectedFieldId}
          selectedProject="No project selected"
          setFormTitle={vi.fn()}
          setFormType={vi.fn()}
          setJourneyStage={vi.fn()}
          setLinkedActivityId={vi.fn()}
          setProjectId={vi.fn()}
          setSaveDialogOpen={vi.fn()}
          setSelectedFieldId={setSelectedFieldId}
          updateField={vi.fn()}
        />
      )
    }
    const go = () => {
      const scroll = vi.fn()
      Element.prototype.scrollIntoView = scroll
      vi.useFakeTimers()
      fireEvent.click(screen.getByRole('button', { name: 'Go to civil_status' }))
      return scroll
    }
    const sectionOf = (name: string) =>
      document.querySelector(`[data-intake-section="${name}"]`) as HTMLElement

    it.each([
      ['CONSENT_SOURCE_PROPOSED', 'source'],
      ['ENUM_ANSWER_UNRESOLVED', 'aliases'],
      ['PARTICIPATION_CONSENT_NO_SOURCE', 'rule'],
      ['WASHINGTON_GROUP_FLAG_DISAGREES', 'rule'],
    ] as const)('takes %s to the %s control and highlights it briefly', (reason, name) => {
      render(<Workspace needsCheck={[{ fieldCode: 'civil_status', reason }]} />)
      const scroll = go()
      expect(
        screen.getByText('Advanced Configuration (Import Metadata)').closest('details')?.open,
      ).toBe(true)
      const section = sectionOf(name)
      expect(section.classList.contains('ring-warning')).toBe(true)
      expect(scroll.mock.contexts[0]).toBe(section)
      vi.advanceTimersByTime(2000)
      expect(section.classList.contains('ring-warning')).toBe(false)
    })

    it('reopens Advanced Configuration a person closed on the field already selected', () => {
      render(
        <Workspace
          needsCheck={[{ fieldCode: 'civil_status', reason: 'CONSENT_SOURCE_PROPOSED' }]}
          startOn="choice-field"
        />,
      )
      const details = screen
        .getByText('Advanced Configuration (Import Metadata)')
        .closest('details') as HTMLDetailsElement
      details.open = false
      go()
      expect(details.open).toBe(true)
    })

    it('moves focus to the control, and to the field when read only', () => {
      const needsCheck = [{ fieldCode: 'civil_status', reason: 'CONSENT_SOURCE_PROPOSED' as const }]
      render(<Workspace needsCheck={needsCheck} />)
      go()
      expect(sectionOf('source').contains(document.activeElement)).toBe(true)
      expect(document.activeElement?.tagName).toBe('INPUT')
      cleanup()
      vi.useRealTimers()
      render(<Workspace needsCheck={needsCheck} readOnly />)
      go()
      expect(document.activeElement?.id).toBe('collection-field-choice-choice-field')
    })

    it('clears the earlier highlight when a person goes to another item', () => {
      const needsCheck = [
        { fieldCode: 'civil_status', reason: 'CONSENT_SOURCE_PROPOSED' as const },
        { fieldCode: initialFields[0].code, reason: 'CONSENT_SOURCE_PROPOSED' as const },
      ]
      render(<Workspace needsCheck={needsCheck} />)
      go()
      const first = sectionOf('source')
      fireEvent.click(screen.getByRole('button', { name: `Go to ${initialFields[0].code}` }))
      expect(first.classList.contains('ring-warning')).toBe(false)
      expect(sectionOf('source').classList.contains('ring-warning')).toBe(true)
    })

    it('only selects the field from the changed fields table', () => {
      const scroll = vi.fn()
      Element.prototype.scrollIntoView = scroll
      render(<Workspace needsCheck={[]} />)
      const table = document.querySelector('table') as HTMLElement
      fireEvent.click(within(table).getByRole('button', { name: 'Civil status', hidden: true }))
      expect(screen.getByText('Selected')).toBeTruthy()
      expect(scroll).not.toHaveBeenCalled()
    })
  })

  it('shows no summary panel without a draft from an import', () => {
    view(null)
    expect(screen.queryByRole('heading', { name: 'Draft from import' })).toBeNull()
  })
})
