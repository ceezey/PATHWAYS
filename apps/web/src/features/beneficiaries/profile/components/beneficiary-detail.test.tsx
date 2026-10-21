/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { JourneyStageConfig } from '@/types/pathways'

import {
  activity,
  beneficiary,
  form,
  project,
  stage,
} from '@/test/fixtures/beneficiary-detail-fixtures'
import { BeneficiaryDetail } from './beneficiary-detail'

const { client, toastSuccess, toastError, useCurrentRoleMock } = vi.hoisted(() => ({
  client: {
    getBeneficiaryJourneyHistory: vi.fn(),
    saveDirectSubmission: vi.fn(),
    submitDirectSubmission: vi.fn(),
    transitionBeneficiaryJourney: vi.fn(),
    correctBeneficiaryJourneyEvent: vi.fn(),
    getBeneficiaryRecordForRole: vi.fn(),
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
vi.mock('@/lib/api/forms', () => ({ formsClient: client }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: client }))
vi.mock('@/lib/api/beneficiaries', () => ({ beneficiariesClient: client }))
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}))
vi.mock('../../media/components/beneficiary-media-proof', () => ({
  BeneficiaryMediaProof: () => <p>Media unavailable</p>,
}))

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

  it('reloads the server journey summary after recording participation', async () => {
    const summary = (progressPercent: number) => ({
      restricted: false as const,
      lastParticipation: null,
      stage: { code: stage.code, name: stage.name, progressPercent },
    })
    client.saveDirectSubmission.mockResolvedValue({ id: 'submission-b', status: 'VALIDATED' })
    client.getBeneficiaryJourneyHistory.mockResolvedValue({ events: [] })
    client.getBeneficiaryRecordForRole.mockResolvedValue({ ...beneficiary, progress: summary(60) })

    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={{ ...beneficiary, progress: summary(20) }}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

    expect(screen.getByText('20% progressed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record participation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save participation' }))

    expect(await screen.findByText('60% progressed')).toBeTruthy()
    expect(client.getBeneficiaryRecordForRole).toHaveBeenCalledWith(
      'Project Officer',
      project.id,
      beneficiary.id,
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
    // Upcoming stages stay selectable so participation can advance the journey.
    const upcoming = screen.getByRole('button', { name: 'J2 Core stage: Upcoming' })
    expect((upcoming as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(upcoming)
    expect(upcoming.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the sibling of the branch a person is on as not on their path', () => {
    const branch = (code: string, name: string, order: number): JourneyStageConfig => ({
      ...stage,
      id: `stage-${code}`,
      code,
      name,
      order,
      type: 'Branch',
      parentStageId: stage.id,
      mappedActivityIds: [`activity-${code}`],
    })
    const participation = {
      id: 'participation-a',
      beneficiaryId: beneficiary.id,
      projectId: project.id,
      activityId: 'activity-J3',
      participatedAt: '2026-06-10',
      attendanceStatus: 'Present' as const,
      note: '',
    }
    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={{ ...beneficiary, participation: [participation] }}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage, branch('J2', 'Wage employment', 2), branch('J3', 'Enterprise start-up', 3)]}
      />,
    )
    expect(screen.getByRole('button', { name: 'J1 Entry stage: Done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'J2 Wage employment: Not on path' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'J3 Enterprise start-up: Current' })).toBeTruthy()
  })
})
