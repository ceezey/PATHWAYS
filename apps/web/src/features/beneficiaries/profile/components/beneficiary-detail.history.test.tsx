/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'
import {
  activity,
  beneficiary,
  form,
  project,
  stage,
} from '@/test/fixtures/beneficiary-detail-fixtures'
import type { BeneficiaryRecord } from '@/types/pathways'
import { BeneficiaryDetail } from './beneficiary-detail'

const { client, toastError, useCurrentRoleMock, routerPush, nav } = vi.hoisted(() => ({
  client: { getBeneficiaryRecordForRole: vi.fn() },
  toastError: vi.fn(),
  useCurrentRoleMock: vi.fn(() => ({ role: 'Project Officer' })),
  routerPush: vi.fn(),
  nav: { searchParams: new URLSearchParams() },
}))

vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: useCurrentRoleMock }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.searchParams,
  useRouter: () => ({ push: routerPush }),
}))
vi.mock('@/lib/api/forms', () => ({ formsClient: client }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: client }))
vi.mock('@/lib/api/beneficiaries', () => ({ beneficiariesClient: client }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))
vi.mock('../../media/components/beneficiary-media-proof', () => ({
  BeneficiaryMediaProof: () => <p>Media unavailable</p>,
}))

// Opening the popper Select idles about 20s in jsdom here, so the file gets a wider test timeout.
vi.setConfig({ testTimeout: 120_000 })

Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  nav.searchParams = new URLSearchParams()
  useCurrentRoleMock.mockReturnValue({ role: 'Project Officer' })
})

const projectB = { ...project, id: 'project-b', title: 'Second project' }
const preTest: BeneficiaryRecord['assessments'][number] = {
  id: 'a1',
  beneficiaryId: beneficiary.id,
  projectId: project.id,
  stageId: stage.id,
  type: 'PRE_TEST',
  title: 'Pre-test',
  assessedAt: '2026-06-01',
  score: 6,
  maximumScore: 10,
  source: 'Assessment result',
  note: '',
}
const props = {
  activities: [activity],
  beneficiary,
  participationForms: [form],
  projectId: project.id,
  projects: [project, projectB],
  stages: [stage],
}

const choose = (label: string, name: string) => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name }))
}

describe('BeneficiaryDetail participation history', () => {
  it('opens on the participation tab from ?tab=participation and lists scores', () => {
    nav.searchParams = new URLSearchParams('tab=participation')
    render(
      <BeneficiaryDetail {...props} beneficiary={{ ...beneficiary, assessments: [preTest] }} />,
    )
    expect(screen.getByRole('tab', { name: 'Participation history', selected: true })).toBeTruthy()
    expect(screen.getByText('Score: 6 / 10')).toBeTruthy()
  })

  it('moves to another project the person is enrolled in', async () => {
    nav.searchParams = new URLSearchParams('tab=participation')
    client.getBeneficiaryRecordForRole.mockResolvedValue(beneficiary)
    render(<BeneficiaryDetail {...props} />)
    choose('Project', projectB.title)
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(
        `/beneficiaries/${beneficiary.id}?tab=participation&projectId=${projectB.id}`,
      ),
    )
    expect(client.getBeneficiaryRecordForRole).toHaveBeenCalledWith(
      'Project Officer',
      projectB.id,
      beneficiary.id,
    )
  })

  it('stays and explains when the person is not enrolled there', async () => {
    nav.searchParams = new URLSearchParams('tab=participation')
    client.getBeneficiaryRecordForRole.mockRejectedValue(
      new PathwaysClientError('Missing.', 'not_found'),
    )
    render(<BeneficiaryDetail {...props} />)
    choose('Project', projectB.title)
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('This person is not enrolled in that project.'),
    )
    expect(routerPush).not.toHaveBeenCalled()
  })
})
