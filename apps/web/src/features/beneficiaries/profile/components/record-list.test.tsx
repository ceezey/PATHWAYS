/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  ActivitySummary,
  BeneficiaryAssessmentRecord,
  BeneficiaryOutcomeRecord,
  BeneficiaryParticipationRecord,
  JourneyStageConfig,
} from '@/types/pathways'

import { buildParticipationHistory } from '../profile.utils'
import { RecordList } from './record-list'

// Opening the popper Select idles about 20s in jsdom here, so the file gets a wider test timeout.
vi.setConfig({ testTimeout: 120_000 })

Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false

afterEach(cleanup)

const activities = [{ id: 'activity-a', title: 'Orientation' }] as ActivitySummary[]
const stages = [
  {
    id: 'stage-1',
    code: 'J1',
    name: 'Entry',
    order: 1,
    type: 'Entry',
    mappedActivityIds: ['activity-a'],
  },
  { id: 'stage-2', code: 'J2', name: 'Training', order: 2, type: 'Core', mappedActivityIds: [] },
] as unknown as JourneyStageConfig[]
const participation = [
  {
    id: 'p1',
    beneficiaryId: 'b1',
    projectId: 'project-a',
    activityId: 'activity-a',
    participatedAt: '2026-06-15',
    attendanceStatus: 'Present',
    note: 'On time',
    outcome: 'In progress',
  },
] as BeneficiaryParticipationRecord[]
const assessments = [
  {
    id: 'a1',
    beneficiaryId: 'b1',
    projectId: 'project-a',
    stageId: 'stage-2',
    type: 'PRE_TEST',
    title: 'Pre-test',
    assessedAt: '2026-06-10',
    score: 6,
    maximumScore: 10,
    source: 'Form',
    note: '',
  },
] as BeneficiaryAssessmentRecord[]
const outcomes = [
  {
    id: 'o1',
    eventType: 'COMPLETION',
    occurredAt: '2026-06-20',
    stageId: null,
    activityId: null,
    description: 'Finished the program.',
  },
] as BeneficiaryOutcomeRecord[]
const entries = buildParticipationHistory({
  participation,
  assessments,
  outcomes,
  activities,
  stages,
})

const renderList = (props: Partial<Parameters<typeof RecordList>[0]> = {}) =>
  render(
    <RecordList
      entries={entries}
      onProjectChange={() => {}}
      projectId="project-a"
      projects={[
        { id: 'project-a', title: 'Project A' },
        { id: 'project-b', title: 'Project B' },
      ]}
      stageDisplayCode={(stage) => stage.code}
      stages={stages}
      title="Participation history"
      {...props}
    />,
  )

const choose = (label: string, name: string) => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name }))
}

describe('RecordList', () => {
  it('shows scores and outcomes per entry', () => {
    renderList()
    expect(screen.getByText('Score: 6 / 10')).toBeTruthy()
    expect(screen.getByText('Outcome: In progress')).toBeTruthy()
    expect(screen.getByText('Outcome: Completed')).toBeTruthy()
  })

  it('labels the row stage badge with the stage display code', () => {
    renderList({ stageDisplayCode: (stage) => `S${stage.order}` })
    expect(screen.getByText('S1')).toBeTruthy()
    expect(screen.queryByText('J1')).toBeNull()
  })

  it('filters by date range and stage', () => {
    renderList()
    fireEvent.change(screen.getByLabelText('History from'), { target: { value: '2026-06-12' } })
    expect(screen.queryByText('Score: 6 / 10')).toBeNull()
    choose('Stage', 'J2 Training')
    expect(screen.getByText('No entries match these filters.')).toBeTruthy()
  })

  it('switches project through the callback', () => {
    const onProjectChange = vi.fn()
    renderList({ onProjectChange })
    choose('Project', 'Project B')
    expect(onProjectChange).toHaveBeenCalledWith('project-b')
  })

  it('keeps the empty-history message', () => {
    renderList({ entries: [] })
    expect(
      screen.getByText('No participation history is available for this coded profile.'),
    ).toBeTruthy()
  })
})
