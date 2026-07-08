import type { PublicProjectRecord } from '@/types/pathways'

export const mockPublicProjects: PublicProjectRecord[] = [
  {
    id: 'futuremakers-ncr',
    title: 'FutureMakers NCR',
    tagline: 'Youth skills, employment readiness, and enterprise support',
    area: 'National Capital Region',
    sector: 'Youth Livelihoods',
    timeframe: 'January 2026 - December 2026',
    approvedSummary:
      'Approved public summary for a youth employability project serving selected urban communities through skills sessions, mentoring, and employment-readiness activities.',
    description:
      'FutureMakers NCR supports young people through market-aware training, coaching, and referral activities that are reviewed through PATHWAYS project monitoring.',
    aboutProject:
      'The project combines orientation, capability building, enterprise preparation, and follow-up support. Public information is limited to approved aggregate progress and project-level outputs.',
    projectAreas: ['Quezon City', 'Manila', 'Navotas'],
    selectedIndicators: [
      {
        id: 'pub-fm-1',
        label: 'Orientation and baseline sessions completed',
        targetLabel: '250 sessions',
        actualLabel: '250 completed',
        progress: 100,
        status: 'Completed',
      },
      {
        id: 'pub-fm-2',
        label: 'Skills bootcamp participation',
        targetLabel: '420 beneficiaries',
        actualLabel: '268 reached',
        progress: 64,
        status: 'On Track',
      },
      {
        id: 'pub-fm-3',
        label: 'Employment-readiness referrals',
        targetLabel: '180 referrals',
        actualLabel: '109 reviewed',
        progress: 61,
        status: 'Monitoring',
      },
    ],
    milestones: [
      {
        id: 'fm-ms-1',
        title: 'Community orientation completed',
        dateLabel: 'February 2026',
        status: 'Completed',
      },
      {
        id: 'fm-ms-2',
        title: 'Core skills sessions underway',
        dateLabel: 'June 2026',
        status: 'In Progress',
      },
      {
        id: 'fm-ms-3',
        title: 'Enterprise mentoring round',
        dateLabel: 'September 2026',
        status: 'Planned',
      },
    ],
    accomplishments: [
      'Orientation activities completed in three project areas.',
      'Skills sessions and mentoring are active with project team review.',
      'Public progress charts use approved aggregate figures only.',
    ],
    progressTrend: [48, 56, 63, 69, 74, 78],
    beneficiariesReached: 842,
    budgetSummary: '61% utilization based on approved public summary values',
    assessmentSummary: '+24% average improvement in reviewed learning checkpoints',
    publicationState: 'Approved for public preview',
  },
  {
    id: 'youth-rise-western-samar',
    title: 'Youth RISE - Western Samar',
    tagline: 'Community learning and livelihood readiness',
    area: 'Western Samar',
    sector: 'Education and Skills',
    timeframe: 'February 2026 - November 2026',
    approvedSummary:
      'Approved public summary for a community-based project helping youth cohorts access learning, readiness checks, and livelihood preparation.',
    description:
      'Youth RISE coordinates training-site readiness, facilitation, and local support activities through human-reviewed project monitoring.',
    aboutProject:
      'The project tracks site readiness, training participation, and follow-up actions at aggregate level. No beneficiary-level information is published.',
    projectAreas: ['Calbayog', 'Catbalogan', 'Basey'],
    selectedIndicators: [
      {
        id: 'pub-yr-1',
        label: 'Training sites validated',
        targetLabel: '12 sites',
        actualLabel: '5 validated',
        progress: 42,
        status: 'Monitoring',
      },
      {
        id: 'pub-yr-2',
        label: 'Learning cohorts initiated',
        targetLabel: '18 cohorts',
        actualLabel: '9 initiated',
        progress: 50,
        status: 'Monitoring',
      },
    ],
    milestones: [
      {
        id: 'yr-ms-1',
        title: 'Site readiness review started',
        dateLabel: 'March 2026',
        status: 'Completed',
      },
      {
        id: 'yr-ms-2',
        title: 'Training support rollout',
        dateLabel: 'July 2026',
        status: 'In Progress',
      },
      {
        id: 'yr-ms-3',
        title: 'Public progress refresh',
        dateLabel: 'October 2026',
        status: 'Planned',
      },
    ],
    accomplishments: [
      'Initial training sites validated by project staff.',
      'Community facilitators are coordinating scheduled learning activities.',
      'Budget and activity status are published only as approved aggregates.',
    ],
    progressTrend: [22, 31, 38, 44, 49, 52],
    beneficiariesReached: 391,
    budgetSummary: '72% utilization based on approved public summary values',
    assessmentSummary: '+13% average improvement in reviewed learning checkpoints',
    publicationState: 'Approved for public preview',
  },
]
