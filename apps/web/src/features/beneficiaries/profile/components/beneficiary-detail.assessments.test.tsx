/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BeneficiaryRecord, JourneyStageConfig } from '@/types/pathways'

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
    recordBeneficiaryAssessment: vi.fn(),
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  useCurrentRoleMock: vi.fn((): { role: string; profile?: unknown } => ({
    role: 'Project Officer',
  })),
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: useCurrentRoleMock,
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: client }))
vi.mock('@/lib/api/forms', () => ({ formsClient: client }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: client }))
vi.mock('@/lib/api/evaluations', () => ({ evaluationsClient: client }))
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

const readerOnly = {
  role: 'Project Officer',
  profile: { roles: ['PROJECT_OFFICER'], permissions: ['assessments.detail.read'] },
}

describe('BeneficiaryDetail assessments', () => {
  const assessment = (id: string, type: 'PRE_TEST' | 'POST_TEST', score: number, date: string) => ({
    id,
    beneficiaryId: beneficiary.id,
    projectId: project.id,
    stageId: stage.id,
    type,
    title: type === 'PRE_TEST' ? 'Pre-test' : 'Post-test',
    assessedAt: date,
    score,
    maximumScore: 50,
    source: 'Assessment result',
    note: '',
  })
  const renderWith = (assessments: BeneficiaryRecord['assessments']) =>
    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={{ ...beneficiary, assessments }}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )

  it('opens the pre and post scores with the change for the selected stage', () => {
    renderWith([
      assessment('a1', 'PRE_TEST', 40, '2026-06-01'),
      assessment('a2', 'POST_TEST', 45, '2026-06-20'),
    ])
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    const button = screen.getByRole('button', { name: 'View assessment' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Pre-test')
    expect(dialog.textContent).toContain('40 / 50')
    expect(dialog.textContent).toContain('Post-test')
    expect(dialog.textContent).toContain('45 / 50')
    expect(dialog.textContent).toContain('Change from pre-test to post-test')
    expect(dialog.textContent).toContain('+5')
  })

  it('omits the change when only one result exists', () => {
    renderWith([assessment('a1', 'PRE_TEST', 40, '2026-06-01')])
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    fireEvent.click(screen.getByRole('button', { name: 'View assessment' }))
    expect(screen.getByRole('dialog').textContent).not.toContain('Change from')
  })

  it('pairs a pre-test and a post-test that sit in different stages', () => {
    const second: JourneyStageConfig = {
      ...stage,
      id: 'stage-b',
      code: 'J2',
      name: 'Post stage',
      order: 2,
      mappedActivityIds: [],
    }
    render(
      <BeneficiaryDetail
        activities={[activity]}
        beneficiary={{
          ...beneficiary,
          assessments: [
            assessment('a1', 'PRE_TEST', 40.2, '2026-06-01'),
            { ...assessment('a2', 'POST_TEST', 45.5, '2026-06-20'), stageId: second.id },
          ],
        }}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage, second]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    const button = screen.getByRole('button', { name: 'View assessment' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    const text = screen.getByRole('dialog').textContent
    expect(text).toContain('J1 Entry stage')
    expect(text).toContain('J2 Post stage')
    expect(text).toContain('+5.3')
  })

  it('omits the change when the maximum scores differ', () => {
    renderWith([
      assessment('a1', 'PRE_TEST', 40, '2026-06-01'),
      { ...assessment('a2', 'POST_TEST', 45, '2026-06-20'), maximumScore: 100 },
    ])
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    fireEvent.click(screen.getByRole('button', { name: 'View assessment' }))
    expect(screen.getByRole('dialog').textContent).not.toContain('Change from')
  })

  it('disables the button for a genuinely empty result', () => {
    useCurrentRoleMock.mockReturnValue(readerOnly)
    renderWith([])
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    const button = screen.getByRole('button', { name: 'View assessment' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('No assessments are recorded for this person.')
  })

  it('says the read failed instead of claiming no assessments', () => {
    render(
      <BeneficiaryDetail
        activities={[activity]}
        assessmentsUnavailable
        beneficiary={beneficiary}
        participationForms={[form]}
        projectId={project.id}
        projects={[project]}
        stages={[stage]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    const button = screen.getByRole('button', { name: 'View assessment' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toContain('could not be loaded')
  })

  it('hides the button from aggregate-only roles', () => {
    useCurrentRoleMock.mockReturnValue({ role: 'Program Manager' })
    renderWith([assessment('a1', 'PRE_TEST', 40, '2026-06-01')])
    fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
    expect(screen.queryByRole('button', { name: 'View assessment' })).toBeNull()
  })

  describe('record score', () => {
    const recordActivity = { ...activity, id: '78100000-0000-4000-8000-000000000030' }
    const enrollment = { ...beneficiary.enrollments[0], id: '78100000-0000-4000-8000-000000000031' }
    const renderRecord = (refreshAssessments = vi.fn().mockResolvedValue(undefined)) => {
      render(
        <BeneficiaryDetail
          activities={[recordActivity]}
          beneficiary={{ ...beneficiary, enrollments: [enrollment] }}
          participationForms={[form]}
          projectId={project.id}
          projects={[project]}
          refreshAssessments={refreshAssessments}
          stages={[{ ...stage, mappedActivityIds: [recordActivity.id] }]}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
      fireEvent.click(screen.getByRole('button', { name: 'View assessment' }))
      return refreshAssessments
    }
    const enterScore = (value: string) =>
      fireEvent.change(screen.getByLabelText('Score'), { target: { value } })

    it('enables View assessment with no results when the user can record', () => {
      renderWith([])
      fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
      expect(
        (screen.getByRole('button', { name: 'View assessment' }) as HTMLButtonElement).disabled,
      ).toBe(false)
    })

    it('keeps View assessment disabled for a reader without record', () => {
      useCurrentRoleMock.mockReturnValue(readerOnly)
      renderWith([])
      fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
      expect(
        (screen.getByRole('button', { name: 'View assessment' }) as HTMLButtonElement).disabled,
      ).toBe(true)
    })

    it('hides the form from a reader without record who has results', () => {
      useCurrentRoleMock.mockReturnValue(readerOnly)
      renderWith([assessment('a1', 'PRE_TEST', 40, '2026-06-01')])
      fireEvent.click(screen.getByRole('button', { name: /J1 Entry stage/ }))
      fireEvent.click(screen.getByRole('button', { name: 'View assessment' }))
      expect(screen.queryByRole('button', { name: 'Save score' })).toBeNull()
    })

    it('submits type, score, maximum and date for the stage activity, then refreshes', async () => {
      client.recordBeneficiaryAssessment.mockResolvedValue({ id: 'new' })
      const refresh = renderRecord()
      fireEvent.click(screen.getByLabelText('Post-test'))
      enterScore('85.5')
      fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '90' } })
      fireEvent.change(screen.getByLabelText('Assessment date'), {
        target: { value: '2026-06-20' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save score' }))
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
      expect(client.recordBeneficiaryAssessment).toHaveBeenCalledWith(project.id, {
        enrollmentId: enrollment.id,
        activityId: recordActivity.id,
        type: 'POST_TEST',
        score: '85.5',
        maximumScore: '90',
        assessmentDate: '2026-06-20',
      })
      expect((screen.getByLabelText('Score') as HTMLInputElement).value).toBe('')
    })

    it('shows the edit note', () => {
      renderRecord()
      expect(screen.getByRole('dialog').textContent).toContain(
        'Recorded scores cannot be edited. To fix a mistake, record a newer result.',
      )
    })

    it('disables Save while saving so a double click sends one request', async () => {
      let resolve: (value: { id: string }) => void = () => undefined
      client.recordBeneficiaryAssessment.mockReturnValue(
        new Promise((done) => {
          resolve = done
        }),
      )
      renderRecord()
      enterScore('40')
      const save = screen.getByRole('button', { name: 'Save score' }) as HTMLButtonElement
      fireEvent.click(save)
      fireEvent.click(save)
      expect(client.recordBeneficiaryAssessment).toHaveBeenCalledTimes(1)
      expect(save.disabled).toBe(true)
      resolve({ id: 'new' })
      await waitFor(() => expect(save.disabled).toBe(false))
    })

    it('keeps inputs and shows the server message on failure', async () => {
      client.recordBeneficiaryAssessment.mockRejectedValue(
        new Error('Record participation for this stage before recording a score.'),
      )
      const refresh = renderRecord()
      enterScore('40')
      fireEvent.click(screen.getByRole('button', { name: 'Save score' }))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Record participation for this stage')
      expect((screen.getByLabelText('Score') as HTMLInputElement).value).toBe('40')
      expect(refresh).not.toHaveBeenCalled()
    })

    it('rejects a comma score before any request', () => {
      renderRecord()
      enterScore('85,5')
      fireEvent.click(screen.getByRole('button', { name: 'Save score' }))
      expect(client.recordBeneficiaryAssessment).not.toHaveBeenCalled()
      expect(screen.getByRole('alert').textContent).toContain('number')
    })
  })
})
