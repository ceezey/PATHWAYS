// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getProjectsForRole } = vi.hoisted(() => ({
  getProjectsForRole: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/hooks/use-prototype-role', () => ({
  usePrototypeRole: () => ({ role: 'M&E' }),
}))

vi.mock('@/lib/services/mock-pathways-client', () => ({
  pathwaysClient: { getProjectsForRole },
}))

vi.mock('./beneficiary-form', () => ({
  BeneficiaryForm: ({ projects }: { projects: Array<{ id: string }> }) => (
    <div data-testid="beneficiary-form">{projects.length} project choices loaded</div>
  ),
}))

import { BeneficiaryFormLoader } from './beneficiary-form-loader'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeneficiaryFormLoader', () => {
  it('keeps a request failure distinct from empty data and retries in place', async () => {
    getProjectsForRole
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce([{ id: 'project-1' }])

    render(<BeneficiaryFormLoader />)

    expect(await screen.findByText('Project choices unavailable')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    fireEvent.click(retry)

    expect((await screen.findByTestId('beneficiary-form')).textContent).toBe(
      '1 project choices loaded',
    )
    expect(getProjectsForRole).toHaveBeenCalledTimes(2)
  })

  it('shows the empty state only after a successful empty response', async () => {
    getProjectsForRole.mockResolvedValueOnce([])

    render(<BeneficiaryFormLoader />)

    expect(await screen.findByText('No assigned projects available')).toBeTruthy()
    expect(screen.queryByText('Project choices unavailable')).toBeNull()
  })
})
