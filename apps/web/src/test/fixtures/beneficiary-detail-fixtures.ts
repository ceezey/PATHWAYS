import type {
  Activity,
  BeneficiaryRecord,
  DigitalFormDefinition,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

export const project: ProjectSummary = {
  id: 'project-a',
  title: 'Synthetic project',
  area: 'Test area',
  sector: 'Test sector',
  status: 'Active',
  health: 'On Track',
  period: '2026',
  projectManager: 'Synthetic manager',
}

export const activity: Activity = {
  id: 'activity-a',
  projectId: project.id,
  title: 'Orientation',
  description: 'Synthetic activity',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  startDate: '2026-06-01',
  dueDate: '2026-06-30',
  assignedUserIds: [],
  assignedTo: [],
  assignedEmails: [],
  indicatorIds: [],
  journeyStageIds: ['stage-a'],
  journeyStageId: 'stage-a',
  targetBeneficiaries: 1,
  beneficiariesReached: 0,
  budgetAllocation: 0,
  budgetLogged: 0,
  progress: 0,

  submittedProof: [],
  updateNotes: [],
  overdueExplanations: [],
  overdueExplanationNeeded: false,
  updatedAt: '2026-06-01T00:00:00.000Z',
}

export const stage: JourneyStageConfig = {
  id: 'stage-a',
  projectId: project.id,
  code: 'J1',
  name: 'Entry stage',
  order: 1,
  type: 'Entry',
  terminal: false,
  mappedActivityIds: [activity.id],
  description: 'Synthetic entry stage',
}

export const form: DigitalFormDefinition = {
  id: 'participation-form',
  projectId: project.id,
  code: 'PARTICIPATION',
  version: 1,
  name: 'Participation',
  description: null,
  formType: 'ACTIVITY_MONITORING',
  status: 'PUBLISHED',
  activityId: activity.id,
  journeyStageId: stage.id,
  updatedAt: '2026-06-01T00:00:00.000Z',
  createdByCurrentUser: false,
  draftSummary: null,
  fields: [],
}

export const beneficiary: BeneficiaryRecord = {
  id: 'beneficiary-a',
  code: 'BEN-C4-001',
  displayName: 'Synthetic Person',
  projectIds: [project.id],
  location: 'Test Barangay, Test City, Test Province',
  sex: 'Not specified',
  ageGroup: '25+',
  disabilityStatus: 'Not specified',
  enrollmentStatus: 'Active',
  subjectType: 'INDIVIDUAL',
  firstName: 'Synthetic',
  lastName: 'Person',
  age: 26,
  province: 'Test Province',
  city: 'Test City',
  barangay: 'Test Barangay',
  consentToParticipate: true,
  consentToStoreData: true,
  isMinor: false,
  guardianConsent: false,
  enrollments: [
    {
      id: 'enrollment-a',
      projectId: project.id,
      status: 'Active',
      enrolledAt: '2026-06-01',
      followUpStatus: 'Not recorded',
    },
  ],
  participation: [],
  assessments: [],
  notes: [],
  updatedAt: '2026-06-01T00:00:00.000Z',
  consentProvenance: [],
}

export const beneficiaryWithNote: BeneficiaryRecord = {
  ...beneficiary,
  notes: [
    {
      id: 'note-a',
      beneficiaryId: beneficiary.id,
      projectId: project.id,
      stageId: stage.id,
      author: 'project-officer-a',
      createdAt: '2026-06-10T00:00:00.000Z',
      visibility: 'Project team',
      note: 'Existing journey note.',
    },
  ],
}
