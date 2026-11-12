/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  activity,
  beneficiary,
  beneficiaryWithNote,
  form,
  project,
  stage,
} from '@/test/fixtures/beneficiary-detail-fixtures'
import { BeneficiaryDetail } from './beneficiary-detail'

const { client, toastSuccess, toastError, useCurrentRoleMock, routerPush } = vi.hoisted(() => ({
  routerPush: vi.fn(),
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
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: routerPush }),
}))
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

Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false

const choose = (label: string, name: RegExp) => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name }))
}

const correctedHistory = {
  projectId: project.id,
  beneficiaryId: beneficiary.id,
  enrollmentId: 'enrollment-a',
  enrollmentStatus: 'ACTIVE',
  events: [
    {
      id: 'event-old',
      eventType: 'PARTICIPATION',
      eventDate: '2026-06-01',
      description: null,
      stageId: stage.id,
      stageCodeSnapshot: 'J1',
      stageNameSnapshot: 'Entry stage',
      activityId: null,
      activityCodeSnapshot: null,
      activityTitleSnapshot: 'Orientation',
      participationId: null,
      participation: null,
      correctsEventId: null,
      correctionReason: null,
      recordedAt: '2026-06-01T00:00:00.000Z',
      recordedBy: 'project-officer-a',
    },
    {
      id: 'correction-a',
      eventType: 'PROGRESS_UPDATE',
      eventDate: '2026-06-20',
      description: 'Attended, not absent.',
      stageId: stage.id,
      stageCodeSnapshot: 'J1',
      stageNameSnapshot: 'Entry stage',
      activityId: null,
      activityCodeSnapshot: null,
      activityTitleSnapshot: null,
      participationId: null,
      participation: null,
      correctsEventId: 'event-old',
      correctionReason: 'Wrong attendance recorded.',
      recordedAt: '2026-06-20T00:00:00.000Z',
      recordedBy: 'project-officer-a',
    },
  ],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useCurrentRoleMock.mockReturnValue({ role: 'Project Officer' })
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

  it('lets an allowed role correct the latest entry and reload journey history', async () => {
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
    const correctButton = screen.getByRole('button', { name: 'Correct entry' })
    expect((correctButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(correctButton)
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Clarifying the recorded outcome.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

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
      'Correction saved and reloaded from the project history.',
    )
  })

  // Opening the popper Select idles about 20s in jsdom here, so this test gets its own timeout.
  it(
    'corrects an older entry of the stage and records the reason',
    { timeout: 120_000 },
    async () => {
      const targets = [
        {
          id: 'event-old',
          stageId: stage.id,
          eventDate: '2026-06-01',
          label: 'Jun 1, 2026 · Participation · Orientation',
          description: '',
          note: '',
        },
        {
          id: 'event-new',
          stageId: stage.id,
          eventDate: '2026-06-10',
          label: 'Jun 10, 2026 · Follow-up · Latest entry.',
          description: 'Latest entry.',
          note: '',
        },
      ]
      client.correctBeneficiaryJourneyEvent.mockResolvedValue({ id: 'correction-a' })
      client.getBeneficiaryJourneyHistory.mockResolvedValue(correctedHistory)

      render(
        <BeneficiaryDetail
          activities={[activity]}
          beneficiary={{ ...beneficiary, correctionTargets: targets }}
          participationForms={[form]}
          projectId={project.id}
          projects={[project]}
          stages={[stage]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Correct entry' }))
      const text = () => (screen.getByLabelText('Note text') as HTMLTextAreaElement).value
      expect(text()).toBe('Latest entry.')
      fireEvent.change(screen.getByLabelText('Correction reason'), {
        target: { value: 'Wrong attendance recorded.' },
      })
      choose('Entry to correct', /Orientation/)
      expect(text()).toBe('')
      expect((screen.getByLabelText('Correction reason') as HTMLTextAreaElement).value).toBe(
        'Wrong attendance recorded.',
      )
      fireEvent.change(screen.getByLabelText('Note text'), {
        target: { value: 'Attended, not absent.' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

      await waitFor(() =>
        expect(client.correctBeneficiaryJourneyEvent).toHaveBeenCalledWith(
          project.id,
          beneficiary.id,
          'event-old',
          expect.objectContaining({
            description: 'Attended, not absent.',
            reason: 'Wrong attendance recorded.',
            stageId: stage.id,
          }),
        ),
      )
      expect(await screen.findByText(/Correction: Wrong attendance recorded\./)).toBeTruthy()
    },
  )

  it('requires a description for an undescribed entry before saving', () => {
    const target = {
      id: 'event-old',
      stageId: stage.id,
      eventDate: '2026-06-01',
      label: 'Jun 1, 2026 · Participation · Orientation',
      description: '',
      note: '',
    }
    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={{ ...beneficiary, correctionTargets: [target] }}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Correct entry' }))
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Wrong attendance recorded.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

    expect(toastError).toHaveBeenCalledWith('Enter a note and a reason for the correction.')
    expect(client.correctBeneficiaryJourneyEvent).not.toHaveBeenCalled()
  })

  it('disables Correct entry when the stage has no uncorrected entry', () => {
    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={{ ...beneficiaryWithNote, correctionTargets: [] }}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    expect(
      (screen.getByRole('button', { name: 'Correct entry' }) as HTMLButtonElement).disabled,
    ).toBe(true)
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
    expect(screen.queryByRole('button', { name: 'Correct entry' })).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Correct entry' }))
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Clarifying the recorded outcome.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('The requested operation could not be completed.'),
    )
    expect(client.getBeneficiaryJourneyHistory).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(() => screen.getByRole('button', { name: 'Save correction' })).not.toThrow()
  })
})
