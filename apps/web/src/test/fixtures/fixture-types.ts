import type { PrototypeRole } from './fixture-roles'

export type ProjectStatus = 'Active' | 'Needs Attention' | 'Planned' | 'Completed'
type HealthStatus = 'On Track' | 'At Risk' | 'Critical'
export type ActivityStatus = 'Planned' | 'In Progress' | 'For Review' | 'Overdue' | 'Completed'
export type BeneficiaryEnrollmentStatus = 'Active' | 'Pending Review' | 'Completed' | 'Exited'

interface ProjectSummary {
  targetGoal: string | null
  id: string
  title: string
  area: string
  sector: string
  status: ProjectStatus
  health: HealthStatus
  period: string
  projectManager: string
  kpiAchievement: number
  beneficiariesReached: number
  targetBeneficiaries: number
  budgetUtilization: number
  timelineProgress: number
}

export interface ProjectDetail extends ProjectSummary {
  objectives?: string
  partners?: string
  archived?: boolean
  projectBudget?: number
  description: string
  programManager: string
  monitoringOfficer: string
  projectOfficers: string[]
  budgetCode: string
  startDate?: string
  endDate?: string
  createdInPrototype?: boolean
}

export interface Activity {
  overrideJustification?: string
  progressApproval?: 'For Review' | 'Approved' | 'For Correction'
  correctionReason?: string
  id: string
  projectId: string
  title: string
  description: string
  status: ActivityStatus
  startDate: string
  dueDate: string
  assignedTo: string[]
  indicatorIds: string[]
  journeyStageId: string
  targetBeneficiaries: number
  beneficiariesReached: number
  budgetAllocation: number
  budgetLogged: number
  progress: number
  submittedProof: ActivityProof[]
  updateNotes: ActivityUpdateNote[]
  extensionRequestedAt?: string
  extensionRequestedBy?: string
}

export interface ActivityProof {
  id: string
  fileName: string
  fileNames?: string[]
  files?: ActivityProofFile[]
  status:
    | 'Draft'
    | 'Submitted'
    | 'Validated'
    | 'Returned'
    | 'Approved'
    | 'Flagged'
    | 'Accepted'
    | 'Superseded'
  submittedAt: string
  submittedBy?: string
  progress?: number
  beneficiariesReachedThisSession?: number
  beneficiariesReachedTotal?: number
  version?: number
  priorActivityStatus?: ActivityStatus
  validatedAt?: string
  validatedBy?: string
  reviewedAt?: string
  reviewedBy?: string
  returnReason?: string
  note?: string
}

export interface ActivityProofFile {
  id: string
  name: string
  type: string
  size: number
}

export interface ActivityUpdateNote {
  id: string
  note: string
  progress: number
  submittedAt: string
}

interface Beneficiary {
  id: string
  code: string
  displayName: string
  projectIds: string[]
  location: string
  sex: 'Female' | 'Male' | 'Prefer not to say'
  ageGroup: '10-14' | '15-17' | '18-24' | '25+'
  disabilityStatus: 'With disability' | 'Without disability' | 'Not disclosed'
  enrollmentStatus: BeneficiaryEnrollmentStatus
}

export type JourneyStageType = 'Entry' | 'Core' | 'Branch' | 'Follow-Up'

export interface JourneyStageConfig {
  id: string
  projectId: string
  code: string
  name: string
  order: number
  type: JourneyStageType
  parentStageId?: string
  terminal: boolean
  mappedActivityIds: string[]
  description: string
}

export interface BeneficiaryEnrollment {
  id: string
  projectId: string
  status: BeneficiaryEnrollmentStatus
  enrolledAt: string
  followUpStatus: 'Not due' | 'Scheduled' | 'Needs follow-up' | 'Completed'
}

export interface BeneficiaryParticipationRecord {
  id: string
  beneficiaryId: string
  projectId: string
  activityId: string
  participatedAt: string
  attendanceStatus: 'Present' | 'Partial' | 'Absent'
  note: string
}

export interface BeneficiaryAssessmentRecord {
  id: string
  beneficiaryId: string
  projectId: string
  stageId: string
  type: 'PRE_TEST' | 'POST_TEST' | 'OUTCOME_SURVEY' | 'FEEDBACK_SURVEY' | 'OTHER'
  title: string
  assessedAt: string
  score: number
  maximumScore: number
  source: string
  note: string
}

export interface BeneficiaryNoteRecord {
  id: string
  beneficiaryId: string
  projectId: string
  stageId: string
  author: string
  createdAt: string
  visibility: 'Internal' | 'Project team'
  note: string
}

export interface BeneficiaryRecord extends Beneficiary {
  firstName: string
  middleName?: string
  lastName: string
  birthDate?: string
  age?: number
  province: string
  city: string
  barangay: string
  consentToParticipate: boolean
  consentToStoreData: boolean
  isMinor: boolean
  guardianConsent: boolean
  enrollments: BeneficiaryEnrollment[]
  participation: BeneficiaryParticipationRecord[]
  assessments: BeneficiaryAssessmentRecord[]
  notes: BeneficiaryNoteRecord[]
}

export interface UserRecord {
  id: string
  name: string
  email: string
  role: PrototypeRole
  accountStatus: UserAccountStatus
  signInMethod: 'Prototype password' | 'SSO placeholder'
  projectIds: string[]
  projectAccess: string[]
  createdAt: string
  lastActiveAt?: string
}

export type UserAccountStatus = 'Active' | 'Invited' | 'Deactivated'
