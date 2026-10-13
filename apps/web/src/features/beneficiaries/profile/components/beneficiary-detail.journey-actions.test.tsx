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
vi.mock('@/lib/api/journeys', () => ({ journeysClient: client }))
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
