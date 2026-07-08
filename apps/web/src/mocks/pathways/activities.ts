import type { Activity } from '@/types/pathways'

export const mockActivities: Activity[] = [
  {
    id: 'act-fm-01',
    projectId: 'futuremakers-ncr',
    title: 'Run cohort orientation and baseline profiling',
    description:
      'Orient the first cohort, confirm eligibility, and complete baseline profiling for enrolled beneficiaries.',
    status: 'Completed',
    startDate: '2026-01-15',
    dueDate: '2026-02-14',
    assignedTo: ['Project Officer A'],
    indicatorIds: ['ind-fm-01'],
    journeyStageId: 'stage-entry',
    targetBeneficiaries: 250,
    beneficiariesReached: 250,
    budgetAllocation: 180000,
    budgetLogged: 172500,
    progress: 100,
    submittedProof: [
      {
        id: 'proof-fm-01',
        fileName: 'orientation-attendance-summary.pdf',
        status: 'Accepted',
        submittedAt: '2026-02-15',
        note: 'Attendance and baseline summary accepted for prototype review.',
      },
    ],
    updateNotes: [
      {
        id: 'note-fm-01',
        note: 'Baseline profiling completed.',
        progress: 100,
        submittedAt: '2026-02-14',
      },
    ],
  },
  {
    id: 'act-fm-02',
    projectId: 'futuremakers-ncr',
    title: 'Deliver skills bootcamp sessions',
    description:
      'Run modular livelihood and employability bootcamp sessions with attendance tracking and post-session checks.',
    status: 'In Progress',
    startDate: '2026-05-05',
    dueDate: '2026-08-30',
    assignedTo: ['Project Officer A', 'Project Officer B'],
    indicatorIds: ['ind-fm-02'],
    journeyStageId: 'stage-core',
    targetBeneficiaries: 420,
    beneficiariesReached: 268,
    budgetAllocation: 620000,
    budgetLogged: 344000,
    progress: 64,
    submittedProof: [
      {
        id: 'proof-fm-02',
        fileName: 'bootcamp-session-photos.zip',
        status: 'Submitted',
        submittedAt: '2026-07-02',
        note: 'Submitted for Monitoring and Evaluation Officer review.',
      },
    ],
    updateNotes: [
      {
        id: 'note-fm-02',
        note: 'Six of ten bootcamp sessions completed.',
        progress: 64,
        submittedAt: '2026-07-02',
      },
    ],
  },
  {
    id: 'act-yr-01',
    projectId: 'youth-rise-western-samar',
    title: 'Validate training site readiness',
    description:
      'Confirm venue readiness, safety checks, facilitator availability, and accessibility arrangements.',
    status: 'Overdue',
    startDate: '2026-04-01',
    dueDate: '2026-06-15',
    assignedTo: ['Project Officer C'],
    indicatorIds: ['ind-yr-01'],
    journeyStageId: 'stage-entry',
    targetBeneficiaries: 180,
    beneficiariesReached: 81,
    budgetAllocation: 95000,
    budgetLogged: 51000,
    progress: 45,
    submittedProof: [
      {
        id: 'proof-yr-01',
        fileName: 'site-readiness-checklist.xlsx',
        status: 'Flagged',
        submittedAt: '2026-06-20',
        note: 'Checklist requires updated venue accessibility notes.',
      },
    ],
    updateNotes: [
      {
        id: 'note-yr-01',
        note: 'Five sites validated; remaining sites need local confirmation.',
        progress: 45,
        submittedAt: '2026-06-20',
      },
    ],
  },
  {
    id: 'act-ss-01',
    projectId: 'safe-spaces-northern-samar',
    title: 'Review referral pathway proof documents',
    description:
      'Review referral pathway case documentation and summarize proof status for project management review.',
    status: 'For Review',
    startDate: '2026-06-01',
    dueDate: '2026-07-18',
    assignedTo: ['Project Officer F'],
    indicatorIds: ['ind-ss-01'],
    journeyStageId: 'stage-follow-up',
    targetBeneficiaries: 120,
    beneficiariesReached: 106,
    budgetAllocation: 140000,
    budgetLogged: 118500,
    progress: 88,
    submittedProof: [
      {
        id: 'proof-ss-01',
        fileName: 'referral-pathway-proof-bundle.pdf',
        status: 'Submitted',
        submittedAt: '2026-07-04',
        note: 'Submitted bundle awaiting review.',
      },
    ],
    updateNotes: [
      {
        id: 'note-ss-01',
        note: 'Referral proof package prepared for review.',
        progress: 88,
        submittedAt: '2026-07-04',
      },
    ],
  },
]
