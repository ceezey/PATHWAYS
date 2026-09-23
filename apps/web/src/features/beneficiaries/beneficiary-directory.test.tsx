/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mockJourneyStages } from '@/mocks/pathways/beneficiaries'
import { mockProjects } from '@/mocks/pathways/projects'
import { testActivities, testBeneficiaries } from '@/mocks/pathways/real-api-fixtures'
import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

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
          activities={testActivities}
          beneficiaries={[...testBeneficiaries, ...extraRecords]}
          projects={mockProjects}
          stages={mockJourneyStages}
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
