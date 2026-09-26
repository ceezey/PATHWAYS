// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { client, access } = vi.hoisted(() => ({
  access: {
    role: 'Project Officer',
    profile: { roles: ['PROJECT_OFFICER'], permissions: ['forms.read'] },
  },
  client: {
    getActivities: vi.fn(),
    getBeneficiaryJourneyHistory: vi.fn(),
    getBeneficiaryRecordForRole: vi.fn(),
    getDigitalForms: vi.fn(),
    getJourneyStages: vi.fn(),
    getProjectsForRole: vi.fn(),
  },
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => access,
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: client,
  PathwaysClientError: class PathwaysClientError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
}))
vi.mock('./beneficiary-detail', () => ({
  BeneficiaryDetail: ({
    beneficiary,
    participationForms,
    projectId,
  }: {
    beneficiary: { id: string; participation: Array<{ id: string }> }
    participationForms: Array<{ id: string }>
    projectId: string
  }) => (
    <div
      data-form-count={participationForms.length}
      data-participation-count={beneficiary.participation.length}
      data-project-id={projectId}
      data-testid="beneficiary-detail"
    >
      {beneficiary.id}
    </div>
  ),
}))

import { BeneficiaryDetailLoader } from './beneficiary-detail-loader'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  access.role = 'Project Officer'
  access.profile.roles = ['PROJECT_OFFICER']
  access.profile.permissions = ['forms.read']
})

describe('BeneficiaryDetailLoader', () => {
  it('loads a PM profile without requesting general collection definitions', async () => {
    access.role = 'Project Manager'
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.permissions = []
    client.getProjectsForRole.mockResolvedValue([{ id: 'project-b' }])
    client.getBeneficiaryRecordForRole.mockResolvedValue({
      id: 'beneficiary-a',
      projectIds: ['project-b'],
      participation: [],
      notes: [],
    })
    client.getActivities.mockResolvedValue([])
    client.getJourneyStages.mockResolvedValue([])
    client.getBeneficiaryJourneyHistory.mockResolvedValue({
      projectId: 'project-b',
      beneficiaryId: 'beneficiary-a',
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [],
    })
    client.getDigitalForms.mockRejectedValue(new Error('General form read denied'))
    render(<BeneficiaryDetailLoader beneficiaryId="beneficiary-a" projectId="project-b" />)
    const detail = await screen.findByTestId('beneficiary-detail')
    expect(detail.getAttribute('data-form-count')).toBe('0')
    expect(client.getDigitalForms).not.toHaveBeenCalled()
  })

  it('loads only the authorized project and joins the accepted journey/form contracts', async () => {
    client.getProjectsForRole.mockResolvedValue([{ id: 'project-a' }, { id: 'project-b' }])
    client.getBeneficiaryRecordForRole.mockResolvedValue({
      id: 'beneficiary-a',
      projectIds: ['project-b'],
      participation: [],
      notes: [],
    })
    client.getActivities.mockResolvedValue([])
    client.getJourneyStages.mockResolvedValue([])
    client.getDigitalForms.mockResolvedValue([
      { id: 'form-a', formType: 'ACTIVITY_MONITORING', status: 'PUBLISHED' },
      { id: 'form-b', formType: 'OTHER', status: 'PUBLISHED' },
    ])
    client.getBeneficiaryJourneyHistory.mockResolvedValue({
      projectId: 'project-b',
      beneficiaryId: 'beneficiary-a',
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [
        {
          id: 'event-a',
          eventType: 'PARTICIPATION',
          eventDate: '2026-06-01',
          description: null,
          stageId: 'stage-a',
          activityId: 'activity-a',
          participationId: 'participation-a',
          participation: { attendanceStatus: 'PRESENT', progressStatus: 'IN_PROGRESS' },
          correctsEventId: null,
          correctionReason: null,
          recordedAt: '2026-06-01T00:00:00.000Z',
          recordedBy: 'officer-a',
        },
      ],
    })

    render(<BeneficiaryDetailLoader beneficiaryId="beneficiary-a" projectId="project-b" />)

    const detail = await screen.findByTestId('beneficiary-detail')
    expect(detail.getAttribute('data-project-id')).toBe('project-b')
    expect(detail.getAttribute('data-participation-count')).toBe('1')
    expect(detail.getAttribute('data-form-count')).toBe('1')
    expect(client.getBeneficiaryRecordForRole).toHaveBeenCalledTimes(1)
    expect(client.getBeneficiaryRecordForRole).toHaveBeenCalledWith(
      'Project Officer',
      'project-b',
      'beneficiary-a',
    )
    await waitFor(() => expect(client.getActivities).toHaveBeenCalledWith('project-b'))
    expect(client.getActivities).not.toHaveBeenCalledWith('project-a')
  })
})
