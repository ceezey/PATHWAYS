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

const { client, toastSuccess, toastError, useCurrentRoleMock } = vi.hoisted(() => ({
  client: {
    getBeneficiaryJourneyHistory: vi.fn(),
    saveDirectSubmission: vi.fn(),
    submitDirectSubmission: vi.fn(),
    transitionBeneficiaryJourney: vi.fn(),
    correctBeneficiaryJourneyEvent: vi.fn(),
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  useCurrentRoleMock: vi.fn(() => ({ role: 'Project Officer' })),
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: useCurrentRoleMock,
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: client }))
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
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

  submittedProof: [],
  updateNotes: [],
  overdueExplanations: [],
  overdueExplanationNeeded: false,
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

const beneficiaryWithNote: BeneficiaryRecord = {
  ...beneficiary,
  notes: [
    {
      id: 'note-a',
      beneficiaryId: beneficiary.id,
      projectId: project.id,
      stageId: stage.id,
      author: 'project-officer-a',
      createdAt: '2026-06-10T00:00:00.000Z',
      visibility: 'Project team',
      note: 'Existing journey note.',
    },
  ],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useCurrentRoleMock.mockReturnValue({ role: 'Project Officer' })
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

describe('BeneficiaryDetail layout', () => {
  const renderDetail = (stages: JourneyStageConfig[] = [stage]) =>
    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={beneficiary}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={stages}
      />,
    )

  it('opens the profile summary dialog from the avatar button', () => {
    renderDetail()
    expect(screen.queryByText('Safe profile name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open profile summary' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Safe profile name')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit beneficiary profile' })).toBeTruthy()
  })

  it('shows header chips and the project link', () => {
    renderDetail()
    expect(screen.getByText('26 yrs')).toBeTruthy()
    expect(screen.getByRole('link', { name: project.title }).getAttribute('href')).toBe(
      '/projects/project-a',
    )
  })

  it('renders the project stages with the current stage marked and locks later ones', () => {
    const second: JourneyStageConfig = {
      ...stage,
      id: 'stage-b',
      code: 'J2',
      name: 'Core stage',
      order: 2,
      type: 'Core',
      mappedActivityIds: [],
    }
    renderDetail([stage, second])
    const current = screen.getByRole('button', { name: 'J1 Entry stage: Current' })
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(
      (screen.getByRole('button', { name: 'J2 Core stage: Locked' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('BeneficiaryDetail journey actions', () => {
  it('lets an allowed role update enrollment status and reload journey history', async () => {
    client.transitionBeneficiaryJourney.mockResolvedValue({
      enrollmentId: 'enrollment-a',
      eventType: 'FOLLOW_UP',
      eventDate: '2026-06-20',
    })
    client.getBeneficiaryJourneyHistory.mockResolvedValue({
      projectId: project.id,
      beneficiaryId: beneficiary.id,
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [],
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
    const updateButton = screen.getByRole('button', { name: 'Update enrollment status' })
    expect((updateButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(updateButton)
    fireEvent.change(screen.getByLabelText('Enrollment status description'), {
      target: { value: 'Follow-up visit completed.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save enrollment status' }))

    await waitFor(() => expect(client.transitionBeneficiaryJourney).toHaveBeenCalledTimes(1))
    expect(client.transitionBeneficiaryJourney).toHaveBeenCalledWith(
      project.id,
      beneficiary.id,
      expect.objectContaining({
        eventType: 'FOLLOW_UP',
        description: 'Follow-up visit completed.',
        stageId: stage.id,
      }),
    )
    await waitFor(() => expect(client.getBeneficiaryJourneyHistory).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith(
      'Enrollment status updated and reloaded from the project history.',
    )
  })

  it('lets an allowed role add a provenance-tracked note and reload journey history', async () => {
    client.correctBeneficiaryJourneyEvent.mockResolvedValue({ id: 'correction-a' })
    client.getBeneficiaryJourneyHistory.mockResolvedValue({
      projectId: project.id,
      beneficiaryId: beneficiary.id,
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [],
    })

    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={beneficiaryWithNote}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    const addNoteButton = screen.getByRole('button', { name: 'Add note' })
    expect((addNoteButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(addNoteButton)
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Clarifying the recorded outcome.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => expect(client.correctBeneficiaryJourneyEvent).toHaveBeenCalledTimes(1))
    expect(client.correctBeneficiaryJourneyEvent).toHaveBeenCalledWith(
      project.id,
      beneficiary.id,
      'note-a',
      expect.objectContaining({
        description: 'Existing journey note.',
        reason: 'Clarifying the recorded outcome.',
        stageId: stage.id,
      }),
    )
    await waitFor(() => expect(client.getBeneficiaryJourneyHistory).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith(
      'Journey note added and reloaded from the project history.',
    )
  })

  it('never renders journey action buttons for aggregate-only roles', () => {
    useCurrentRoleMock.mockReturnValue({ role: 'Program Manager' })

    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={beneficiaryWithNote}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    expect(screen.queryByRole('button', { name: 'Update enrollment status' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
  })

  it('surfaces a step-up-required rejection through the existing toast without a false-success refresh', async () => {
    client.transitionBeneficiaryJourney.mockRejectedValue(
      new Error('Recent MFA verification is required for Beneficiary detail.'),
    )

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
    fireEvent.click(screen.getByRole('button', { name: 'Update enrollment status' }))
    fireEvent.change(screen.getByLabelText('Enrollment status description'), {
      target: { value: 'Follow-up visit completed.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save enrollment status' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Recent MFA verification is required for Beneficiary detail.',
      ),
    )
    expect(client.getBeneficiaryJourneyHistory).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(() => screen.getByRole('button', { name: 'Save enrollment status' })).not.toThrow()
  })

  it('shows a generic server error via toast without crashing or a false-success refresh', async () => {
    client.correctBeneficiaryJourneyEvent.mockRejectedValue(
      new Error('The requested operation could not be completed.'),
    )

    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={beneficiaryWithNote}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Clarifying the recorded outcome.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('The requested operation could not be completed.'),
    )
    expect(client.getBeneficiaryJourneyHistory).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(() => screen.getByRole('button', { name: 'Save note' })).not.toThrow()
  })
})
