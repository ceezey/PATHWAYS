/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
})
