/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { mockActivities } from '@/mocks/pathways/activities'
import { mockBeneficiaryRecords, mockJourneyStages } from '@/mocks/pathways/beneficiaries'
import { mockProjects } from '@/mocks/pathways/projects'
import { PrototypeLabelsProvider } from '@/providers/prototype-labels-provider'
import { PrototypeRoleProvider } from '@/providers/prototype-role-provider'

import { BeneficiaryDirectory } from './beneficiary-directory'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('BeneficiaryDirectory', () => {
  it('clears active search state and returns pagination to the first page', async () => {
    window.localStorage.setItem('pathways.prototypeRole', 'Project Manager')
    const extraRecords = Array.from({ length: 9 }, (_, index) => ({
      ...mockBeneficiaryRecords[0],
      code: `BEN-NCR-${index + 10}`,
      displayName: `Beneficiary NCR-${index + 10}`,
      id: `ben-extra-${index + 10}`,
    }))

    render(
      <PrototypeRoleProvider>
        <PrototypeLabelsProvider>
          <BeneficiaryDirectory
            activities={mockActivities}
            beneficiaries={[...mockBeneficiaryRecords, ...extraRecords]}
            projects={mockProjects}
            stages={mockJourneyStages}
          />
        </PrototypeLabelsProvider>
      </PrototypeRoleProvider>,
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
