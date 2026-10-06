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
    getBeneficiaryAssessments: vi.fn(),
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
    assessmentsUnavailable,
  }: {
    beneficiary: {
      id: string
      participation: Array<{ id: string }>
      assessments: Array<{ id: string }>
    }
    participationForms: Array<{ id: string }>
    projectId: string
    assessmentsUnavailable: boolean
  }) => (
    <div
      data-form-count={participationForms.length}
      data-assessment-count={beneficiary.assessments.length}
      data-assessments-unavailable={String(assessmentsUnavailable)}
      data-participation-count={beneficiary.participation.length}
      data-project-id={projectId}
      data-testid="beneficiary-detail"
    >
      {beneficiary.id}
    </div>
  ),
}))

import { STEP_UP_COMPLETED_EVENT } from '@/lib/auth/beneficiary-step-up-events'
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
      enrollments: [],
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
      enrollments: [],
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

  describe('assessments', () => {
    const setupLoad = (permissions: string[]) => {
      access.profile.permissions = permissions
      client.getProjectsForRole.mockResolvedValue([{ id: 'project-b' }])
      client.getBeneficiaryRecordForRole.mockResolvedValue({
        id: 'beneficiary-a',
        projectIds: ['project-b'],
        enrollments: [{ id: 'enrollment-a', projectId: 'project-b' }],
        participation: [],
        assessments: [],
        notes: [],
      })
      client.getActivities.mockResolvedValue([])
      client.getJourneyStages.mockResolvedValue([])
      client.getDigitalForms.mockResolvedValue([])
      client.getBeneficiaryJourneyHistory.mockResolvedValue({
        projectId: 'project-b',
        beneficiaryId: 'beneficiary-a',
        enrollmentId: 'enrollment-a',
        enrollmentStatus: 'ACTIVE',
        events: [],
      })
    }
    const row = {
      id: 'assessment-a',
      type: 'PRE_TEST',
      activityId: 'activity-a',
      stageId: 'stage-a',
      score: '40',
      maximumScore: '50',
      assessmentDate: '2026-09-01',
      recordedAt: '2026-09-02T00:00:00.000Z',
    }

    it('maps the list into the record when the role can view assessment detail', async () => {
      setupLoad(['assessments.detail.read'])
      client.getBeneficiaryAssessments.mockResolvedValue([row])
      render(<BeneficiaryDetailLoader beneficiaryId="beneficiary-a" projectId="project-b" />)
      const detail = await screen.findByTestId('beneficiary-detail')
      expect(detail.getAttribute('data-assessment-count')).toBe('1')
      expect(client.getBeneficiaryAssessments).toHaveBeenCalledWith(
        'project-b',
        'enrollment-a',
        expect.anything(),
      )
    })

    it('keeps the page usable when the assessment read is denied', async () => {
      setupLoad(['assessments.detail.read'])
      client.getBeneficiaryAssessments.mockRejectedValue(new Error('step-up required'))
      render(<BeneficiaryDetailLoader beneficiaryId="beneficiary-a" projectId="project-b" />)
      const detail = await screen.findByTestId('beneficiary-detail')
      expect(detail.getAttribute('data-assessment-count')).toBe('0')
      expect(detail.getAttribute('data-assessments-unavailable')).toBe('true')
    })

    it('re-reads the assessments after a completed step-up without reloading the page', async () => {
      setupLoad(['assessments.detail.read'])
      client.getBeneficiaryAssessments.mockRejectedValueOnce(new Error('step-up required'))
      client.getBeneficiaryAssessments.mockResolvedValueOnce([row])
      render(<BeneficiaryDetailLoader beneficiaryId="beneficiary-a" projectId="project-b" />)
      const detail = await screen.findByTestId('beneficiary-detail')
      expect(detail.getAttribute('data-assessments-unavailable')).toBe('true')
      window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT))
      await waitFor(() =>
        expect(screen.getByTestId('beneficiary-detail').getAttribute('data-assessment-count')).toBe(
          '1',
        ),
      )
      expect(
        screen.getByTestId('beneficiary-detail').getAttribute('data-assessments-unavailable'),
      ).toBe('false')
      expect(client.getBeneficiaryAssessments).toHaveBeenCalledTimes(2)
      expect(client.getBeneficiaryJourneyHistory).toHaveBeenCalledTimes(1)
    })

    it('does not request assessments without the permission', async () => {
      setupLoad([])
      render(<BeneficiaryDetailLoader beneficiaryId="beneficiary-a" projectId="project-b" />)
      await screen.findByTestId('beneficiary-detail')
      expect(client.getBeneficiaryAssessments).not.toHaveBeenCalled()
    })
  })
})
