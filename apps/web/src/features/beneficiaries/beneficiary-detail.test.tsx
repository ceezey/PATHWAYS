/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  Activity,
  BeneficiaryRecord,
  DigitalFormDefinition,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { BeneficiaryDetail } from './beneficiary-detail'

const { client, toastSuccess } = vi.hoisted(() => ({
  client: {
    getBeneficiaryJourneyHistory: vi.fn(),
    saveDirectSubmission: vi.fn(),
    submitDirectSubmission: vi.fn(),
  },
  toastSuccess: vi.fn(),
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ role: 'Project Officer' }),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: client }))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: toastSuccess },
}))
vi.mock('./beneficiary-media-proof', () => ({
  BeneficiaryMediaProof: () => <p>Media unavailable</p>,
}))

const project: ProjectSummary = {
  id: 'project-a',
  title: 'Synthetic project',
  area: 'Test area',
  sector: 'Test sector',
  status: 'Active',
  health: 'On Track',
  period: '2026',
  projectManager: 'Synthetic manager',
  kpiAchievement: 0,
  beneficiariesReached: 0,
  budgetUtilization: 0,
  timelineProgress: 0,
  targetGoal: null,
}

const activity: Activity = {
  id: 'activity-a',
  projectId: project.id,
  title: 'Orientation',
  description: 'Synthetic activity',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  startDate: '2026-06-01',
  dueDate: '2026-06-30',
  assignedUserIds: [],
  assignedTo: [],
  assignedEmails: [],
  indicatorIds: [],
  journeyStageIds: ['stage-a'],
  journeyStageId: 'stage-a',
  targetBeneficiaries: 1,
  beneficiariesReached: 0,
  budgetAllocation: 0,
  budgetLogged: 0,
  progress: 0,
  projectGoalComparison: { state: 'UNAVAILABLE', reason: 'TARGET_GOAL_UNSET' },
  submittedProof: [],
  updateNotes: [],
  updatedAt: '2026-06-01T00:00:00.000Z',
}

const stage: JourneyStageConfig = {
  id: 'stage-a',
  projectId: project.id,
  code: 'J1',
  name: 'Entry stage',
  order: 1,
  type: 'Entry',
  terminal: false,
  mappedActivityIds: [activity.id],
  description: 'Synthetic entry stage',
}

const form: DigitalFormDefinition = {
  id: 'participation-form',
  projectId: project.id,
  code: 'PARTICIPATION',
  version: 1,
  name: 'Participation',
  description: null,
  formType: 'ACTIVITY_MONITORING',
  status: 'PUBLISHED',
  activityId: activity.id,
  journeyStageId: stage.id,
  updatedAt: '2026-06-01T00:00:00.000Z',
  createdByCurrentUser: false,
  fields: [],
}

const beneficiary: BeneficiaryRecord = {
  id: 'beneficiary-a',
  code: 'BEN-C4-001',
  displayName: 'Synthetic Person',
  projectIds: [project.id],
  location: 'Test Barangay, Test City, Test Province',
  sex: 'Not specified',
  ageGroup: '25+',
  disabilityStatus: 'Not specified',
  enrollmentStatus: 'Active',
  subjectType: 'INDIVIDUAL',
  firstName: 'Synthetic',
  lastName: 'Person',
  age: 26,
  province: 'Test Province',
  city: 'Test City',
  barangay: 'Test Barangay',
  consentToParticipate: true,
  consentToStoreData: true,
  isMinor: false,
  guardianConsent: false,
  enrollments: [
    {
      id: 'enrollment-a',
      projectId: project.id,
      status: 'Active',
      enrolledAt: '2026-06-01',
      followUpStatus: 'Not recorded',
    },
  ],
  participation: [],
  assessments: [],
  notes: [],
  updatedAt: '2026-06-01T00:00:00.000Z',
  consentProvenance: [],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeneficiaryDetail participation', () => {
  it('submits through the accepted form contract and reloads persisted chronological history', async () => {
    client.saveDirectSubmission.mockResolvedValue({
      id: 'submission-a',
      status: 'DRAFT',
      updatedAt: '2026-06-15T00:00:00.000Z',
    })
    client.submitDirectSubmission.mockResolvedValue({ id: 'submission-a', status: 'VALIDATED' })
    client.getBeneficiaryJourneyHistory.mockResolvedValue({
      projectId: project.id,
      beneficiaryId: beneficiary.id,
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [
        {
          id: 'event-a',
          eventType: 'PARTICIPATION',
          eventDate: '2026-06-15',
          description: 'Recorded from the UI.',
          stageId: stage.id,
          stageCodeSnapshot: stage.code,
          stageNameSnapshot: stage.name,
          activityId: activity.id,
          activityCodeSnapshot: 'ACT-1',
          activityTitleSnapshot: activity.title,
          participationId: 'participation-a',
          participation: { attendanceStatus: 'PRESENT', progressStatus: 'IN_PROGRESS' },
          correctsEventId: null,
          correctionReason: null,
          recordedAt: '2026-06-15T12:00:00.000Z',
          recordedBy: 'project-officer-a',
        },
      ],
    })

    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={beneficiary}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record participation' }))
    fireEvent.change(screen.getByLabelText('Participation notes'), {
      target: { value: 'Recorded from the UI.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save participation' }))

    await waitFor(() => expect(client.submitDirectSubmission).toHaveBeenCalledTimes(1))
    expect(client.saveDirectSubmission).toHaveBeenCalledWith(
      project.id,
      form.id,
      expect.any(String),
      expect.objectContaining({
        beneficiary_code: beneficiary.code,
        attendance_status: 'PRESENT',
        progress_status: 'IN_PROGRESS',
      }),
    )
    expect(client.getBeneficiaryJourneyHistory).toHaveBeenCalledWith(project.id, beneficiary.id)
    expect(await screen.findAllByText(/Recorded from the UI/)).not.toHaveLength(0)
    expect(toastSuccess).toHaveBeenCalledWith(
      'Participation recorded and reloaded from the project history.',
    )
  })
})
