/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'
import { testBeneficiaries } from '@/test/fixtures/api-view-fixtures'
import { mockProjects } from '@/test/fixtures/projects'

import { BeneficiaryDirectory } from './beneficiary-directory'

vi.mock('@/lib/env', () => ({
  webSetupState: {
    rolePreviewEnabled: true,
  },
}))

vi.mock('@/providers/current-role-provider', () => ({
  useCurrentRole: () => ({ role: 'Project Manager', assignedProjectIds: ['futuremakers-ncr'] }),
}))

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const directoryProps = {
  beneficiaries: testBeneficiaries,
  projects: mockProjects,
  projectId: 'futuremakers-ncr',
  onProjectChange: () => undefined,
  status: 'success' as 'loading' | 'error' | 'success',
  onRetry: () => undefined,
}

const renderDirectory = (props: Partial<typeof directoryProps>) =>
  render(
    <DisplayLabelsProvider>
      <BeneficiaryDirectory {...directoryProps} {...props} />
    </DisplayLabelsProvider>,
  )

describe('BeneficiaryDirectory project read states', () => {
  it('keeps the filters and shows a loading row while a project loads', () => {
    renderDirectory({ status: 'loading' })
    expect(screen.getByLabelText('Search by name or code')).toBeTruthy()
    expect(screen.getAllByText('Loading Beneficiary records.').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /^Open / })).toBeNull()
  })

  it('offers a retry when a project read fails', () => {
    const onRetry = vi.fn()
    renderDirectory({ status: 'error', onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('BeneficiaryDirectory', () => {
  it('clears active search state and returns pagination to the first page', async () => {
    const extraRecords = Array.from({ length: 9 }, (_, index) => ({
      ...testBeneficiaries[0],
      code: `BEN-NCR-${index + 10}`,
      displayName: `Beneficiary NCR-${index + 10}`,
      id: `ben-extra-${index + 10}`,
    }))

    render(
      <DisplayLabelsProvider>
        <BeneficiaryDirectory
          {...directoryProps}
          beneficiaries={[...testBeneficiaries, ...extraRecords]}
        />
      </DisplayLabelsProvider>,
    )

    expect(screen.getAllByRole('link', { name: /^Open / })[0]?.getAttribute('href')).toContain(
      'projectId=futuremakers-ncr',
    )

    const clear = screen.getByRole('button', { name: 'Clear all filters' })
    const search = screen.getByLabelText('Search by name or code') as HTMLInputElement
    expect(clear.hasAttribute('disabled')).toBe(true)

    fireEvent.change(search, { target: { value: 'Beneficiary' } })
    expect(clear.hasAttribute('disabled')).toBe(false)
    const next = screen.getByRole('button', { name: 'Next' })
    await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false))
    fireEvent.click(next)
    await waitFor(() => expect(screen.getByText(/Page 2 of \d+/)).toBeTruthy())

    fireEvent.click(clear)
    expect(search.value).toBe('')
    await waitFor(() => expect(screen.getByText(/Page 1 of \d+/)).toBeTruthy())
    expect(clear.hasAttribute('disabled')).toBe(true)
  })
})

describe('BeneficiaryDirectory journey summary', () => {
  const show = (progress: (typeof testBeneficiaries)[number]['progress']) => {
    render(
      <DisplayLabelsProvider>
        <BeneficiaryDirectory
          {...directoryProps}
          beneficiaries={[{ ...testBeneficiaries[0], participation: [], progress }]}
        />
      </DisplayLabelsProvider>,
    )
  }

  it('shows the stage and last activity the server computed', () => {
    show({
      restricted: false,
      lastParticipation: { activityId: 'a1', title: 'Life skills session', date: '2026-09-30' },
      stage: { code: 'LIFESKILLS', name: 'Life skills sessions', progressPercent: 40 },
    })
    expect(screen.getByText('LIFESKILLS')).toBeTruthy()
    expect(screen.getByText('Life skills session')).toBeTruthy()
    expect(screen.queryByText('No participation yet')).toBeNull()
  })

  it('shows Restricted, never No participation yet, when the caller cannot read journeys', () => {
    show({ restricted: true })
    expect(screen.getAllByText('Restricted').length).toBe(2)
    expect(screen.queryByText('No participation yet')).toBeNull()
  })

  it('shows No participation yet only when nothing is recorded', () => {
    show({ restricted: false, lastParticipation: null, stage: null })
    expect(screen.getByText('No participation yet')).toBeTruthy()
  })
})
