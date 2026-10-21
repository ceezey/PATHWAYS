/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'
import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'

import { BeneficiaryDirectoryLoader } from './beneficiary-directory-loader'

const first = '72000000-0000-4000-8000-000000000001'
const second = '72000000-0000-4000-8000-000000000002'
const api = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getBeneficiaryRecordsForRole: vi.fn(),
}))
const access = vi.hoisted(() => ({
  access: 'ready',
  assignedProjectIds: [
    '72000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
  ],
  role: 'Project Manager',
  profile: {
    id: 'synthetic-subject',
    organizationId: '10000000-0000-4000-8000-000000000001',
    userId: '60000000-0000-4000-8000-000000000006',
    roles: ['PROJECT_MANAGER'],
    permissions: ['projects.read', 'beneficiaries.records.read'],
    assignedProjectIds: [
      '72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002',
    ],
  },
}))

vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/api/beneficiaries', () => ({ beneficiariesClient: api }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('./beneficiary-directory', () => ({
  BeneficiaryDirectory: ({
    beneficiaries,
    onProjectChange,
    projectId,
    status,
  }: {
    beneficiaries: unknown[]
    onProjectChange: (id: string) => void
    projectId: string
    status: string
  }) => (
    <div>
      <p>
        {projectId} {status} {beneficiaries.length}
      </p>
      <button onClick={() => onProjectChange(second)} type="button">
        Switch
      </button>
    </div>
  ),
}))

const renderLoader = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <BeneficiaryDirectoryLoader />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )

describe('BeneficiaryDirectoryLoader', () => {
  beforeEach(() => {
    access.profile.permissions = ['projects.read', 'beneficiaries.records.read']
    api.getProjects.mockResolvedValue([
      { id: first, title: 'Project One' },
      { id: second, title: 'Project Two' },
    ])
    api.getBeneficiaryRecordsForRole.mockImplementation(async (_role: string, id: string) =>
      id === first ? [{ id: 'b1' }] : [{ id: 'b2' }, { id: 'b3' }],
    )
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reads only the selected project records', async () => {
    renderLoader()
    expect(await screen.findByText(`${first} success 1`)).toBeTruthy()
    expect(api.getBeneficiaryRecordsForRole).toHaveBeenCalledOnce()
    expect(api.getBeneficiaryRecordsForRole).toHaveBeenCalledWith(
      'Project Manager',
      first,
      undefined,
      expect.any(AbortSignal),
    )
  })

  it('reads the next project only when the selection changes', async () => {
    renderLoader()
    fireEvent.click(await screen.findByRole('button', { name: 'Switch' }))
    expect(await screen.findByText(`${second} success 2`)).toBeTruthy()
    expect(api.getBeneficiaryRecordsForRole).toHaveBeenCalledTimes(2)
    expect(api.getBeneficiaryRecordsForRole.mock.lastCall?.[1]).toBe(second)
  })

  it('keeps the chosen project selected when its read is denied', async () => {
    renderLoader()
    await screen.findByText(`${first} success 1`)
    api.getBeneficiaryRecordsForRole.mockRejectedValueOnce(
      new PathwaysClientError('Denied.', 'forbidden', [], 403),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    expect(await screen.findByText(`${second} error 0`)).toBeTruthy()
    expect(screen.queryByText(new RegExp(first))).toBeNull()
  })

  it('shows an empty directory without reading records when the actor lacks record access', async () => {
    access.profile.permissions = ['projects.read']
    renderLoader()
    expect(await screen.findByText(`${first} success 0`)).toBeTruthy()
    expect(api.getBeneficiaryRecordsForRole).not.toHaveBeenCalled()
  })

  it('offers a retry when the first read fails', async () => {
    api.getBeneficiaryRecordsForRole.mockRejectedValueOnce(new Error('offline'))
    renderLoader()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(`${first} success 1`)).toBeTruthy()
  })
})
