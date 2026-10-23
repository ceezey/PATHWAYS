/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { initialFields } from '../forms.utils'
import { BuilderView } from './builder-view'

afterEach(cleanup)

vi.mock('./journey-stage-selector', () => ({ JourneyStageSelector: () => null }))

const summary = {
  addedFields: ['attendance_status'],
  sourceNamesAdded: [],
  optionsAdded: [],
  aliasesAdded: 0,
  defaults: [],
  rules: [],
  needsCheck: [{ fieldCode: 'beneficiary_id', reason: 'IDENTIFIER_PROPOSED' as const }],
}

const view = (draftSummary: typeof summary | null, setSelectedFieldId = vi.fn()) =>
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
      onPublish={vi.fn()}
      projectActivities={[]}
      projects={[]}
      projectsLoaded
      projectId=""
      readOnly={false}
      sadddCount={0}
      selectedFieldId=""
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

  it('shows no summary panel without a draft from an import', () => {
    view(null)
    expect(screen.queryByRole('heading', { name: 'Draft from import' })).toBeNull()
  })
})
