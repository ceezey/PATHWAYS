/**
 * Content for the local presentation workspace (apps/api/prisma/local-demo-seed.ts). Pure data and
 * pure builders only: no I/O, no clock reads, so the content can be unit tested. Everything here is
 * fictional. Dates are expressed as day offsets from the run date so that "overdue", "near
 * completion" and "upcoming" stay true whenever the workspace is built.
 */

export type ProjectKey = 'SSG' | 'CRL' | 'ALS' | 'ECD' | 'WSH' | 'EHK'

export type DemoProgram = { code: string; name: string; description: string }

export const demoPrograms: DemoProgram[] = [
  {
    code: 'RES-2026',
    name: 'Resilient Communities Program',
    description:
      'Strengthens household resilience, livelihoods and school water and sanitation services in disaster-prone provinces of Eastern Visayas.',
  },
  {
    code: 'ECD-2026',
    name: 'Early Childhood Care and Development Program',
    description:
      'Supports parenting groups and community child development centers in the Bicol Region and Eastern Visayas.',
  },
]

export type DemoStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED'

export type DemoProject = {
  key: ProjectKey
  code: string
  title: string
  programCode: string
  description: string
  objectives: string
  implementationArea: string
  sector: string
  targetBeneficiaries: number
  projectBudget: string
  partners: string[]
  /** Days from the run date. */
  startOffset: number
  endOffset: number
  status: DemoStatus
  /** Which staff members from the project officer pool work on the project. */
  officers: Array<'liza' | 'emmanuel'>
  province: string
  cityMunicipality: string
  barangays: string[]
}

/** SSG is created by the base local seed (local-synthetic-seed.ts); the rest are created here. */
export const demoProjects: DemoProject[] = [
  {
    key: 'SSG',
    code: 'SSG-ES-2026',
    title: 'Safe Schools for Girls – Eastern Samar',
    programCode: 'EDU-2026',
    description: '',
    objectives: '',
    implementationArea: 'Borongan City, Guiuan and Llorente, Eastern Samar',
    sector: 'Education',
    targetBeneficiaries: 160,
    projectBudget: '0',
    partners: [],
    startOffset: 0,
    endOffset: 0,
    status: 'ONGOING',
    officers: ['liza'],
    province: 'Eastern Samar',
    cityMunicipality: 'Borongan City',
    barangays: ['Songco', 'Sabang', 'Maypangdan', 'Taboc', 'Punta Maria', 'Campesao'],
  },
  {
    key: 'CRL',
    code: 'CRL-NS-2026',
    title: 'Community Resilience and Livelihoods – Northern Samar',
    programCode: 'RES-2026',
    description:
      'Builds household and community resilience through livelihood diversification and disaster preparedness in coastal barangays of Northern Samar.',
    objectives:
      'Increase household income diversification and establish functioning barangay disaster response teams.',
    implementationArea: 'Catarman and Lavezares, Northern Samar',
    sector: 'Livelihoods',
    targetBeneficiaries: 36,
    projectBudget: '3200000.00',
    partners: [
      'Northern Samar Provincial Agriculture Office',
      'Catarman Municipal Disaster Risk Reduction and Management Office',
    ],
    startOffset: -200,
    endOffset: 320,
    status: 'ONGOING',
    officers: ['liza', 'emmanuel'],
    province: 'Northern Samar',
    cityMunicipality: 'Catarman',
    barangays: ['Bocsol', 'Dalakit', 'Baybay', 'Cawayan', 'Lapu-lapu'],
  },
  {
    key: 'ALS',
    code: 'ALS-NS-2026',
    title: 'Alternative Learning System Support – Lavezares',
    programCode: 'EDU-2026',
    description:
      'Helps out-of-school youth and adults in Lavezares complete accreditation and equivalency learning through community learning centers.',
    objectives:
      'Enable out-of-school learners to reach the Alternative Learning System accreditation and equivalency assessment.',
    implementationArea: 'Lavezares, Northern Samar',
    sector: 'Education',
    targetBeneficiaries: 36,
    projectBudget: '1850000.00',
    partners: ['Department of Education Northern Samar Division', 'Lavezares Municipal Office'],
    startOffset: -330,
    endOffset: 21,
    status: 'ONGOING',
    officers: ['liza'],
    province: 'Northern Samar',
    cityMunicipality: 'Lavezares',
    barangays: ['Macarthur', 'Del Rosario', 'Poblacion', 'San Isidro'],
  },
  {
    key: 'ECD',
    code: 'ECD-MB-2026',
    title: 'Early Childhood Development Pilot – Masbate City',
    programCode: 'ECD-2026',
    description:
      'Pilots a small early childhood development and parenting support cohort in Masbate City before a wider rollout.',
    objectives:
      'Validate the parenting-session curriculum with a small starting cohort before scale-up.',
    implementationArea: 'Masbate City, Masbate',
    sector: 'Early Childhood Development',
    targetBeneficiaries: 40,
    projectBudget: '450000.00',
    partners: ['Masbate City Social Welfare and Development Office'],
    startOffset: 21,
    endOffset: 386,
    status: 'PLANNED',
    officers: ['emmanuel'],
    province: 'Masbate',
    cityMunicipality: 'Masbate City',
    barangays: ['Bapor', 'Nursery', 'Tugbo', 'Pating'],
  },
  {
    key: 'WSH',
    code: 'WSH-NS-2025',
    title: 'School Water, Sanitation and Hygiene Rehabilitation – Catarman',
    programCode: 'RES-2026',
    description:
      'Rehabilitates handwashing stations and toilets in public elementary schools of Catarman and trains school hygiene clubs.',
    objectives:
      'Restore safe water and sanitation facilities in twelve schools and establish school hygiene clubs.',
    implementationArea: 'Catarman, Northern Samar',
    sector: 'Water, Sanitation and Hygiene',
    targetBeneficiaries: 36,
    projectBudget: '2650000.00',
    partners: ['Catarman Schools Division Office', 'Northern Samar Provincial Engineering Office'],
    startOffset: -400,
    endOffset: -30,
    status: 'ONGOING',
    officers: ['liza', 'emmanuel'],
    province: 'Northern Samar',
    cityMunicipality: 'Catarman',
    barangays: ['Bocsol', 'Lapu-lapu', 'Cawayan'],
  },
  {
    key: 'EHK',
    code: 'EHK-ES-2026',
    title: 'Emergency Hygiene and Learning Kits – Guiuan',
    programCode: 'EDU-2026',
    description:
      'Delivered hygiene and learning kits to families of learners in typhoon-affected barangays of Guiuan, Eastern Samar.',
    objectives:
      'Return displaced learners to class with essential hygiene and school supplies within eight weeks of the typhoon.',
    implementationArea: 'Guiuan, Eastern Samar',
    sector: 'Education',
    targetBeneficiaries: 75,
    projectBudget: '980000.00',
    partners: ['Guiuan Municipal Social Welfare and Development Office'],
    startOffset: -300,
    endOffset: -45,
    status: 'COMPLETED',
    officers: ['liza'],
    province: 'Eastern Samar',
    cityMunicipality: 'Guiuan',
    barangays: ['Sulangan', 'Salug', 'Bungtod'],
  },
]

export type ActivityOutcome =
  | 'COMPLETED'
  | 'COMPLETED_LATE'
  | 'PENDING_REVIEW'
  | 'RETURNED'
  | 'PROGRESS_VERIFIED'
  | 'OVERDUE_EXPLAINED'
  | 'OVERDUE_OPEN'
  | 'IN_PROGRESS'
  | 'NOT_STARTED'
  | 'CANCELLED'

export type DemoActivity = {
  key: string
  title: string
  type: string
  description: string
  /** Days from the run date. */
  startOffset: number
  endOffset: number
  target: number
  /** Planned PHP allocation; omitted when the project budget is held at envelope level. */
  budget?: string
  outcome: ActivityOutcome
  officer: 'liza' | 'emmanuel'
  /** Progress percent used by the outcome (proof or recorded progress). */
  progress?: number
  note?: string
  reviewNote?: string
  reason?: string
  category?: 'WEATHER' | 'SECURITY' | 'FUNDING' | 'COMMUNITY' | 'LOGISTICS' | 'OTHER'
  explanation?: string
  reached?: number
}

export const demoActivities: Record<ProjectKey, DemoActivity[]> = {
  SSG: [
    {
      key: 'baseline',
      title: 'Baseline household and school survey',
      type: 'Assessment',
      description:
        'Household and school survey in six barangays to establish the attendance and dropout baseline for adolescent girls.',
      startOffset: -170,
      endOffset: -140,
      target: 150,
      budget: '180000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'All 150 household interviews and 14 school head interviews completed; data entry verified.',
      reviewNote: 'Household coverage confirmed against the survey plan.',
      reached: 150,
    },
    {
      key: 'orientation',
      title: 'Barangay orientation on child protection and school safety',
      type: 'Community Engagement',
      description:
        'Orientation sessions for barangay councils, parents and school heads on safe school practices and referral routes.',
      startOffset: -130,
      endOffset: -105,
      target: 140,
      budget: '95000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Six orientation sessions held; attendance sheets and photos submitted.',
      reviewNote: 'Attendance sheets match the planned participant lists.',
      reached: 136,
    },
    {
      key: 'lifeskills',
      title: 'Girls life skills and leadership sessions',
      type: 'Capacity Building',
      description:
        'Weekly life skills and leadership sessions for adolescent girls in partner schools.',
      startOffset: -60,
      endOffset: 45,
      target: 150,
      budget: '260000.00',
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 55,
      note: 'Sessions 1 to 6 completed in Songco, Sabang and Maypangdan; 82 girls attended regularly.',
      reviewNote: 'Progress matches the session attendance records.',
      reached: 82,
    },
    {
      key: 'committee',
      title: 'Training of school protection committee members',
      type: 'Capacity Building',
      description:
        'Three-day training for school protection committee members on case handling and referral.',
      startOffset: -25,
      endOffset: 20,
      target: 60,
      budget: '150000.00',
      outcome: 'PENDING_REVIEW',
      officer: 'liza',
      progress: 70,
      note: 'Training days 1 and 2 completed for 41 committee members from 9 schools; day 3 scheduled.',
      reached: 41,
    },
    {
      key: 'kits',
      title: 'Distribution of learning kits to at-risk girls',
      type: 'Distribution',
      description:
        'Distribution of school bags, notebooks and hygiene supplies to girls at risk of dropping out.',
      startOffset: -50,
      endOffset: -10,
      target: 150,
      budget: '320000.00',
      outcome: 'OVERDUE_EXPLAINED',
      officer: 'liza',
      category: 'LOGISTICS',
      explanation:
        'Delivery of notebooks was delayed by two weeks because the supplier could not ship during the storm warning; distribution resumes next week.',
    },
    {
      key: 'referral',
      title: 'Referral pathway mapping with municipal offices',
      type: 'Coordination',
      description:
        'Mapping of child protection referral services with the municipal social welfare office and health units.',
      startOffset: -45,
      endOffset: -7,
      target: 12,
      budget: '0.00',
      outcome: 'OVERDUE_OPEN',
      officer: 'liza',
    },
    {
      key: 'radio',
      title: 'Community radio drama series on girls in school',
      type: 'Awareness',
      description: 'Radio drama series broadcast over the municipal community station.',
      startOffset: -20,
      endOffset: 30,
      target: 150,
      budget: '70000.00',
      outcome: 'CANCELLED',
      officer: 'liza',
      reason: 'Replaced by school-based awareness sessions after the station schedule changed.',
    },
    {
      key: 'parents',
      title: 'Parent and teacher dialogue on girls education',
      type: 'Community Engagement',
      description: 'Quarterly dialogue between parents, teachers and barangay leaders.',
      startOffset: 10,
      endOffset: 25,
      target: 120,
      budget: '60000.00',
      outcome: 'NOT_STARTED',
      officer: 'liza',
    },
    {
      key: 'returnedproof',
      title: 'Peer educator training for senior high school girls',
      type: 'Capacity Building',
      description:
        'Training of senior high school girls as peer educators on safe school practices.',
      startOffset: -35,
      endOffset: 12,
      target: 45,
      budget: '110000.00',
      outcome: 'RETURNED',
      officer: 'liza',
      progress: 40,
      note: 'Peer educator training day 1 held for 22 girls in Taboc and Punta Maria.',
      reviewNote:
        'The attendance sheet in the uploaded proof is unsigned; please upload the signed copy.',
      reached: 22,
    },
    {
      key: 'webinar',
      title: 'Career pathway orientation webinar',
      type: 'Capacity Building',
      description:
        'Online orientation for senior girls on career pathways, scholarships and the entrepreneurship and technology skills tracks.',
      startOffset: -45,
      endOffset: 25,
      target: 100,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 60,
      note: 'Two webinar sessions held; the girls chose their tracks at the end of each session.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 80,
    },
    {
      key: 'entrep',
      title: 'Entrepreneurship track sessions',
      type: 'Capacity Building',
      description:
        'Weekly sessions on small enterprise planning and savings for girls who chose the entrepreneurship track.',
      startOffset: -30,
      endOffset: 30,
      target: 80,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 45,
      note: 'Entrepreneurship sessions are running in three schools.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 40,
    },
    {
      key: 'tech',
      title: 'Technology skills track sessions',
      type: 'Capacity Building',
      description:
        'Weekly sessions on basic computer and digital safety skills for girls who chose the technology track.',
      startOffset: -30,
      endOffset: 30,
      target: 70,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 45,
      note: 'Technology sessions are running at the school computer laboratories.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 35,
    },
    {
      key: 'posttest',
      title: 'Post-assessment administration',
      type: 'Assessment',
      description:
        'Post-assessment on life skills, career readiness and safety practices after the track sessions.',
      startOffset: -20,
      endOffset: 20,
      target: 100,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 40,
      note: 'The post-assessment was given to the first groups that finished their track.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 30,
    },
  ],
  CRL: [
    {
      key: 'assessment',
      title: 'Household livelihood and vulnerability assessment',
      type: 'Assessment',
      description:
        'Assessment of household income sources and disaster exposure in five barangays.',
      startOffset: -180,
      endOffset: -140,
      target: 30,
      outcome: 'COMPLETED',
      officer: 'emmanuel',
      progress: 100,
      note: 'Assessment forms collected from 30 households.',
      reviewNote: 'Coverage and household selection verified.',
      reached: 30,
    },
    {
      key: 'drrm',
      title: 'Barangay disaster response team training',
      type: 'Capacity Building',
      description:
        'Training of barangay disaster response teams on early warning, evacuation and first aid.',
      startOffset: -90,
      endOffset: -40,
      target: 30,
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Five barangay teams completed the three-day training.',
      reviewNote: 'Certificates and attendance verified.',
      reached: 28,
    },
    {
      key: 'livelihood',
      title: 'Abaca and coconut by-product livelihood grants',
      type: 'Livelihood Support',
      description:
        'Starter grants and coaching for household enterprises in abaca and coconut processing.',
      startOffset: -30,
      endOffset: 60,
      target: 45,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'emmanuel',
      progress: 40,
      note: '20 households received grants and coaching in Bocsol and Dalakit.',
      reviewNote: 'Grant acknowledgment receipts match the beneficiary list.',
      reached: 20,
    },
    {
      key: 'savings',
      title: 'Community savings group formation',
      type: 'Livelihood Support',
      description: 'Formation and coaching of village savings and loan associations.',
      startOffset: 15,
      endOffset: 120,
      target: 30,
      outcome: 'NOT_STARTED',
      officer: 'liza',
    },
    {
      key: 'monitoring',
      title: 'Monthly monitoring visit to livelihood groups',
      type: 'Monitoring',
      description: 'Monthly field visit to monitor enterprise progress and group attendance.',
      startOffset: -10,
      endOffset: 20,
      target: 5,
      outcome: 'IN_PROGRESS',
      officer: 'emmanuel',
    },
    {
      key: 'hazards',
      title: 'Barangay hazard map validation and evacuation signage',
      type: 'Capacity Building',
      description:
        'Validation of barangay hazard maps with residents and installation of evacuation route signage.',
      startOffset: -75,
      endOffset: -25,
      target: 5,
      outcome: 'COMPLETED_LATE',
      officer: 'liza',
      progress: 100,
      category: 'LOGISTICS',
      explanation:
        'Signage printing was delayed by the supplier and two barangays rescheduled the validation sessions because of fishing season; installation finished two weeks after the planned date.',
      note: 'Hazard maps validated in five barangays and 32 evacuation route signs installed.',
      reviewNote: 'Signage photos and validation attendance sheets match the plan.',
      reached: 5,
    },
    {
      key: 'coordination',
      title: 'Coordination meeting with the provincial agriculture office',
      type: 'Coordination',
      description:
        'Meeting to agree on technical support and market linkages for the supported livelihood groups.',
      startOffset: -40,
      endOffset: -12,
      target: 2,
      outcome: 'OVERDUE_OPEN',
      officer: 'liza',
    },
    {
      key: 'enterprise',
      title: 'Enterprise record keeping coaching for grant recipients',
      type: 'Capacity Building',
      description:
        'Coaching of grant recipients on simple bookkeeping and cash management for household enterprises.',
      startOffset: -28,
      endOffset: 14,
      target: 20,
      outcome: 'RETURNED',
      officer: 'emmanuel',
      progress: 45,
      note: 'Coaching days 1 and 2 completed for 14 grant recipients in Bocsol.',
      reviewNote:
        'The reported 14 participants do not match the 11 names on the uploaded attendance sheet; please upload the complete sheet.',
      reached: 14,
    },
    {
      key: 'drill',
      title: 'Community early warning and evacuation drill',
      type: 'Capacity Building',
      description:
        'Simulation drill with trained barangay response teams and households in coastal purok.',
      startOffset: -12,
      endOffset: 9,
      target: 30,
      outcome: 'PENDING_REVIEW',
      officer: 'liza',
      progress: 80,
      note: 'Drills held in Baybay and Cawayan with 26 residents; evaluation form results attached.',
      reached: 26,
    },
  ],
  ALS: [
    {
      key: 'mapping',
      title: 'Out-of-school youth mapping and enrollment drive',
      type: 'Outreach',
      description:
        'Door-to-door mapping and enrollment drive for out-of-school youth in four barangays.',
      startOffset: -320,
      endOffset: -280,
      target: 30,
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: '34 out-of-school youth mapped and 30 enrolled in learning centers.',
      reviewNote: 'Enrollment list reconciled with the mapping records.',
      reached: 30,
    },
    {
      key: 'facilitators',
      title: 'Learning facilitator training',
      type: 'Capacity Building',
      description: 'Training of community learning facilitators on the ALS curriculum.',
      startOffset: -270,
      endOffset: -230,
      target: 24,
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: '24 facilitators completed the training.',
      reviewNote: 'Training records verified.',
      reached: 24,
    },
    {
      key: 'sessions',
      title: 'Community learning center sessions, cycle 1',
      type: 'Education Delivery',
      description: 'Twelve-week learning sessions in four community learning centers.',
      startOffset: -220,
      endOffset: -100,
      target: 30,
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Cycle 1 concluded with 26 learners attending the full session set.',
      reviewNote: 'Session logs and completion list verified.',
      reached: 26,
    },
    {
      key: 'results',
      title: 'Cycle 1 learner results validation',
      type: 'Review',
      description: 'Validation of cycle 1 learner results with the division ALS coordinator.',
      startOffset: -75,
      endOffset: -20,
      target: 26,
      outcome: 'COMPLETED_LATE',
      officer: 'liza',
      progress: 100,
      category: 'COMMUNITY',
      explanation:
        'The division coordinator was only available after the schedule of the national assessment, so the validation was held two weeks after the planned date.',
      note: 'Results of 26 cycle 1 learners validated and signed by the division coordinator.',
      reviewNote: 'Signed results list matches the learner completion records.',
      reached: 26,
    },
    {
      key: 'reviewclass',
      title: 'Accreditation and equivalency exam review classes',
      type: 'Education Delivery',
      description: 'Review classes before the accreditation and equivalency assessment.',
      startOffset: -60,
      endOffset: 10,
      target: 40,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 85,
      note: 'Review classes are in the final two weeks; 22 learners attend regularly.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 22,
    },
    {
      key: 'closeout',
      title: 'Project close-out and learning review workshop',
      type: 'Review',
      description: 'Close-out workshop with partners to document results and lessons.',
      startOffset: 7,
      endOffset: 18,
      target: 30,
      outcome: 'NOT_STARTED',
      officer: 'liza',
    },
    {
      key: 'webinar',
      title: 'Career pathway orientation webinar',
      type: 'Education Delivery',
      description:
        'Online orientation for learners on career pathways after accreditation and the two skills tracks.',
      startOffset: -35,
      endOffset: 25,
      target: 30,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 60,
      note: 'Two webinar sessions held for the learning centers.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 24,
    },
    {
      key: 'entrep',
      title: 'Entrepreneurship track sessions',
      type: 'Education Delivery',
      description:
        'Weekly sessions on starting a small business for learners who chose the entrepreneurship track.',
      startOffset: -30,
      endOffset: 30,
      target: 16,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 50,
      note: 'Entrepreneurship sessions are running at two learning centers.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 12,
    },
    {
      key: 'tech',
      title: 'Technology skills track sessions',
      type: 'Education Delivery',
      description:
        'Weekly sessions on basic computer skills for learners who chose the technology track.',
      startOffset: -30,
      endOffset: 30,
      target: 14,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 50,
      note: 'Technology sessions are running at the community learning center.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 11,
    },
    {
      key: 'assessment',
      title: 'Accreditation and equivalency assessment administration',
      type: 'Assessment',
      description:
        'Administration of the post-assessment and accreditation and equivalency assessment after the track sessions.',
      startOffset: -20,
      endOffset: 18,
      target: 26,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 40,
      note: 'The first group of learners took the assessment.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 10,
    },
  ],
  ECD: [
    {
      key: 'parenting',
      title: 'Parenting sessions for caregivers of children under five',
      type: 'Capacity Building',
      description: 'Bi-weekly parenting sessions for caregivers in four barangays.',
      startOffset: 28,
      endOffset: 118,
      target: 40,
      budget: '150000.00',
      outcome: 'NOT_STARTED',
      officer: 'emmanuel',
    },
    {
      key: 'play',
      title: 'Community play and stimulation corners setup',
      type: 'Infrastructure',
      description:
        'Setup of play and stimulation corners in two community child development centers.',
      startOffset: 35,
      endOffset: 70,
      target: 2,
      budget: '95000.00',
      outcome: 'NOT_STARTED',
      officer: 'emmanuel',
    },
    {
      key: 'homevisit',
      title: 'Home visits for developmental screening',
      type: 'Monitoring',
      description: 'Home visits to screen developmental milestones of enrolled children.',
      startOffset: 60,
      endOffset: 140,
      target: 30,
      budget: '60000.00',
      outcome: 'NOT_STARTED',
      officer: 'emmanuel',
    },
  ],
  WSH: [
    {
      key: 'facility',
      title: 'Assessment of school water and sanitation facilities',
      type: 'Assessment',
      description: 'Facility assessment in twelve public elementary schools.',
      startOffset: -390,
      endOffset: -350,
      target: 12,
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Twelve schools assessed and prioritized for rehabilitation.',
      reviewNote: 'Assessment forms and photos verified.',
      reached: 12,
    },
    {
      key: 'rehab',
      title: 'Rehabilitation of handwashing stations and toilets',
      type: 'Infrastructure',
      description: 'Construction and repair of handwashing stations and toilet blocks.',
      startOffset: -340,
      endOffset: 25,
      target: 12,
      outcome: 'PROGRESS_VERIFIED',
      officer: 'emmanuel',
      progress: 70,
      note: 'Eight of twelve schools have completed handwashing stations and toilet blocks; four flooded sites resume once materials arrive.',
      reviewNote: 'Site photos and acceptance forms match the eight completed schools.',
      reached: 8,
    },
    {
      key: 'hygiene',
      title: 'School hygiene club formation and training',
      type: 'Capacity Building',
      description: 'Formation and training of hygiene clubs in each partner school.',
      startOffset: -200,
      endOffset: 20,
      target: 30,
      outcome: 'PENDING_REVIEW',
      officer: 'liza',
      progress: 60,
      note: 'Hygiene clubs formed and trained in eight schools; club officers elected and attendance sheets attached.',
      reached: 18,
    },
    {
      key: 'handover',
      title: 'Facility handover and maintenance plan signing',
      type: 'Coordination',
      description: 'Handover ceremonies and signing of maintenance plans with school heads.',
      startOffset: 5,
      endOffset: 40,
      target: 12,
      outcome: 'NOT_STARTED',
      officer: 'emmanuel',
    },
  ],
  EHK: [
    {
      key: 'procure',
      title: 'Procurement of hygiene and learning kits',
      type: 'Procurement',
      description: 'Procurement of 70 hygiene and learning kits.',
      startOffset: -290,
      endOffset: -250,
      target: 70,
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'All 70 kits procured and delivered to the Guiuan warehouse.',
      reviewNote: 'Delivery receipts verified.',
      reached: 70,
    },
    {
      key: 'distribute',
      title: 'Kit distribution to families in three barangays',
      type: 'Distribution',
      description: 'Distribution of kits in Sulangan, Salug and Bungtod.',
      startOffset: -245,
      endOffset: -150,
      target: 70,
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Kits distributed to 70 families; signed acknowledgment lists submitted.',
      reviewNote: 'Acknowledgment lists reconciled with the beneficiary registry.',
      reached: 70,
    },
  ],
}

/** Beneficiary cohorts: how many people to register per project and how ages are spread. */
export type DemoCohort = {
  count: number
  /** Repeating age pattern; the cohort cycles through it. */
  ages: number[]
  femaleShare: number
  /** Latest enrollment offset from the project start in days, when enrollment closes early. */
  enrollWindowDays?: number
}

export const demoCohorts: Record<ProjectKey, DemoCohort> = {
  SSG: {
    count: 150,
    ages: [
      12, 14, 16, 13, 15, 17, 11, 10, 14, 16, 38, 41, 45, 52, 29, 35, 13, 15, 12, 9, 7, 5, 66, 70,
    ],
    femaleShare: 0.75,
  },
  CRL: {
    count: 30,
    ages: [28, 34, 41, 52, 37, 45, 23, 61, 48, 33, 19, 26, 55, 39, 44, 30, 68, 22],
    femaleShare: 0.6,
  },
  ALS: { count: 30, ages: [17, 19, 22, 25, 18, 30, 21, 16, 27, 35, 20, 24], femaleShare: 0.55 },
  // The pilot has not started, so nobody is enrolled yet.
  ECD: { count: 0, ages: [5], femaleShare: 0.5 },
  WSH: { count: 30, ages: [8, 9, 10, 11, 12, 7, 6, 41, 35, 50], femaleShare: 0.5 },
  // Every SADDD marginal (sex, age band at project end, disability) stays at 5 or more, so the closed-project release shows.
  EHK: {
    count: 70,
    ages: [6, 11, 35, 7, 12, 8, 13, 42, 6, 10, 7, 12],
    femaleShare: 0.55,
    enrollWindowDays: 115,
  },
}

export const femaleFirstNames = [
  'Angelica',
  'Jocelyn',
  'Maricris',
  'Kyla',
  'Princess',
  'Rhea',
  'Shiela',
  'Jenny',
  'Liezel',
  'Marites',
  'Analyn',
  'Christine',
  'Ericka',
  'Hazel',
  'Rowena',
  'Lovely',
  'Aiza',
  'Nova',
  'Cherry',
  'Mylene',
  'Rosalie',
  'Jessa',
  'Lea',
  'Norma',
  'Cristina',
  'Gemma',
  'Vilma',
  'Elizabeth',
]
export const maleFirstNames = [
  'Rex',
  'Ryan',
  'Jomar',
  'Renato',
  'Arnel',
  'Dexter',
  'Nelson',
  'Randy',
  'Joel',
  'Marlon',
  'Ferdinand',
  'Edwin',
  'Gilbert',
  'Alvin',
  'Danilo',
  'Noel',
]
export const middleNames = [
  'Abella',
  'Cinco',
  'Lagrimas',
  'Ogayon',
  'Espina',
  'Nacional',
  'Baldeo',
  'Tabalba',
  'Gabon',
  'Alcala',
]
export const lastNames = [
  'Abesamis',
  'Cabrera',
  'Tabuena',
  'Nacional',
  'Gabon',
  'Espina',
  'Lagrimas',
  'Cinco',
  'Alcala',
  'Ogayon',
  'Baldeo',
  'Lumen',
  'Marquez',
  'Quilantang',
  'Sabalza',
  'Tomarong',
  'Evardone',
  'Cabales',
  'Yabut',
  'Dagondon',
]

export function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function yearsBeforeIso(iso: string, years: number, extraDays = 0) {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCFullYear(date.getUTCFullYear() - years)
  date.setUTCDate(date.getUTCDate() - extraDays)
  return date.toISOString().slice(0, 10)
}

export type PlannedPerson = {
  code: string
  firstName: string
  middleName: string
  lastName: string
  sex: 'MALE' | 'FEMALE'
  age: number
  birthDate: string
  barangay: string
  disability: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY'
  enrollmentDate: string
}

/** Day offset from the project start: three days apart, spread evenly when that would pass the cap. */
function enrollmentOffset(index: number, cohort: DemoCohort, daysRunning: number) {
  const cap = Math.max(
    20,
    Math.min(daysRunning - 10, cohort.enrollWindowDays ?? Number.MAX_SAFE_INTEGER),
  )
  const natural = 20 + index * 3
  if (20 + (cohort.count - 1) * 3 <= cap) return natural
  return 20 + Math.floor((index * (cap - 20)) / Math.max(1, cohort.count - 1))
}

/** Deterministic cohort for one project: same input, same people. */
export function planCohort(
  project: DemoProject,
  today: string,
  projectStart: string,
): PlannedPerson[] {
  const cohort = demoCohorts[project.key]
  const people: PlannedPerson[] = []
  const seed = project.key.charCodeAt(0) + project.key.charCodeAt(1)
  for (let index = 0; index < cohort.count; index += 1) {
    const age = cohort.ages[index % cohort.ages.length]
    const female = (index * 7 + seed) % 100 < cohort.femaleShare * 100
    const firstNames = female ? femaleFirstNames : maleFirstNames
    const enrollOffset = enrollmentOffset(index, cohort, daysBetween(projectStart, today))
    const enrollmentDate = addDaysIso(projectStart, enrollOffset)
    people.push({
      code: `BEN-${project.code}-${String(index + 1).padStart(3, '0')}`,
      firstName: firstNames[(index * 5 + seed) % firstNames.length],
      middleName: middleNames[(index * 3 + seed) % middleNames.length],
      lastName: lastNames[(index * 7 + seed * 3) % lastNames.length],
      sex: female ? 'FEMALE' : 'MALE',
      age,
      birthDate: yearsBeforeIso(enrollmentDate, age, (index * 13) % 300),
      barangay: project.barangays[index % project.barangays.length],
      disability: index % 11 === 0 ? 'WITH_DISABILITY' : 'WITHOUT_DISABILITY',
      enrollmentDate,
    })
  }
  return people
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00.000Z`) - Date.parse(`${fromIso}T00:00:00.000Z`)) / 86_400_000,
  )
}

export type IndicatorType =
  | 'OUTPUT'
  | 'OUTCOME'
  | 'ACTIVITY'
  | 'BUDGET'
  | 'TIMELINE'
  | 'PARTICIPATION'
  | 'SURVEY_SCORE'

export type DemoIndicator = {
  code: string
  indicatorType: IndicatorType
  name: string
  unit: string
  numericKind: 'COUNT' | 'PERCENTAGE' | 'NON_NEGATIVE'
  baseline: string
  target: string
  /** Successive readings, oldest first. */
  readings: string[]
  /** Keys of the project activities that produce this indicator. */
  activityKeys: string[]
}

export const demoIndicators: Record<ProjectKey, DemoIndicator[]> = {
  SSG: [
    {
      code: 'SSG-GIRLS-ENR',
      indicatorType: 'OUTPUT',
      name: 'Girls reached with school protection activities',
      unit: 'girls',
      numericKind: 'COUNT',
      baseline: '0',
      target: '120',
      readings: ['30', '62', '90', '105'],
      activityKeys: ['baseline', 'orientation', 'lifeskills', 'returnedproof'],
    },
    {
      code: 'SSG-ATT-RATE',
      indicatorType: 'OUTCOME',
      name: 'Regular school attendance rate of girls',
      unit: 'percent',
      numericKind: 'PERCENTAGE',
      baseline: '68.00',
      target: '90.00',
      readings: ['70.50', '73.20', '76.80', '79.40'],
      activityKeys: ['lifeskills', 'kits'],
    },
    {
      code: 'SSG-COMM-FUNC',
      indicatorType: 'ACTIVITY',
      name: 'School protection committees functioning',
      unit: 'committees',
      numericKind: 'COUNT',
      baseline: '2',
      target: '14',
      readings: ['3', '5', '8'],
      activityKeys: ['committee', 'referral'],
    },
    {
      code: 'SSG-KNOW-SCORE',
      indicatorType: 'SURVEY_SCORE',
      name: 'Average school safety knowledge score of committee members',
      unit: 'points',
      numericKind: 'NON_NEGATIVE',
      baseline: '52.00',
      target: '75.00',
      readings: ['58.00', '63.50', '67.00'],
      activityKeys: ['committee', 'posttest'],
    },
  ],
  CRL: [
    {
      code: 'CRL-HH-DIV',
      indicatorType: 'OUTCOME',
      name: 'Households with two or more income sources',
      unit: 'households',
      numericKind: 'COUNT',
      baseline: '6',
      target: '30',
      readings: ['12', '18', '24'],
      activityKeys: ['livelihood', 'enterprise', 'savings'],
    },
    {
      code: 'CRL-DRR-TEAMS',
      indicatorType: 'OUTPUT',
      name: 'Barangay disaster response teams trained',
      unit: 'teams',
      numericKind: 'COUNT',
      baseline: '0',
      target: '10',
      readings: ['2', '5', '5'],
      activityKeys: ['drrm', 'drill', 'hazards'],
    },
    {
      code: 'CRL-BUDGET-USE',
      indicatorType: 'BUDGET',
      name: 'Share of the livelihood grant fund released to household groups',
      unit: 'percent',
      numericKind: 'PERCENTAGE',
      baseline: '0.00',
      target: '100.00',
      readings: ['25.00', '48.50', '71.00'],
      activityKeys: ['livelihood', 'monitoring'],
    },
  ],
  ALS: [
    {
      code: 'ALS-ENROLLED',
      indicatorType: 'PARTICIPATION',
      name: 'Out-of-school learners enrolled in learning centers',
      unit: 'learners',
      numericKind: 'COUNT',
      baseline: '0',
      target: '30',
      readings: ['18', '26', '30'],
      activityKeys: ['mapping', 'sessions'],
    },
    {
      code: 'ALS-COMPLETION',
      indicatorType: 'OUTCOME',
      name: 'Learners completing the module set',
      unit: 'percent',
      numericKind: 'PERCENTAGE',
      baseline: '0.00',
      target: '80.00',
      readings: ['5.00', '12.50', '20.00'],
      activityKeys: ['reviewclass', 'results', 'assessment'],
    },
  ],
  ECD: [
    {
      code: 'ECD-CAREGIVERS',
      indicatorType: 'PARTICIPATION',
      name: 'Caregivers attending parenting sessions',
      unit: 'caregivers',
      numericKind: 'COUNT',
      baseline: '0',
      target: '40',
      readings: [],
      activityKeys: ['parenting'],
    },
  ],
  WSH: [
    {
      code: 'WSH-SCHOOLS',
      indicatorType: 'OUTPUT',
      name: 'Schools with functioning handwashing stations',
      unit: 'schools',
      numericKind: 'COUNT',
      baseline: '1',
      target: '12',
      readings: ['2', '4', '5'],
      activityKeys: ['facility', 'rehab'],
    },
    {
      code: 'WSH-CLUBS',
      indicatorType: 'ACTIVITY',
      name: 'School hygiene clubs active',
      unit: 'clubs',
      numericKind: 'COUNT',
      baseline: '0',
      target: '12',
      readings: ['1', '3'],
      activityKeys: ['hygiene'],
    },
    {
      code: 'WSH-HANDOVER',
      indicatorType: 'TIMELINE',
      name: 'Schools handed over against the revised work plan',
      unit: 'percent',
      numericKind: 'PERCENTAGE',
      baseline: '0.00',
      target: '100.00',
      readings: ['17.00', '33.00', '42.00'],
      activityKeys: ['rehab', 'handover'],
    },
  ],
  EHK: [
    {
      code: 'EHK-FAMILIES',
      indicatorType: 'OUTPUT',
      name: 'Families receiving hygiene and learning kits',
      unit: 'families',
      numericKind: 'COUNT',
      baseline: '0',
      target: '75',
      readings: ['34', '70'],
      activityKeys: ['distribute'],
    },
    {
      code: 'EHK-KITS',
      indicatorType: 'OUTPUT',
      name: 'Hygiene and learning kits procured',
      unit: 'kits',
      numericKind: 'COUNT',
      baseline: '0',
      target: '70',
      readings: ['35', '70'],
      activityKeys: ['procure'],
    },
  ],
}

export type DemoBudgetLine = {
  category: string
  amount: string
  remarks?: string
}

/** Category lines that are not activity allocations; activity budgets come from the activities. */
export const demoBudgets: Partial<Record<ProjectKey, DemoBudgetLine[]>> = {
  SSG: [
    {
      category: 'PROJECT_PROFILE_TOTAL',
      amount: '1455000.00',
      remarks: 'Project profile planned budget.',
    },
    {
      category: 'Project staff travel',
      amount: '210000.00',
      remarks: 'Monthly travel to partner schools.',
    },
  ],
}

export type DemoExpense = {
  project: ProjectKey
  /** Charged to this activity budget row; otherwise to the category line or the project envelope. */
  activityKey?: string
  budgetCategory?: string
  description: string
  amount: string
  /** Days before the run date. */
  daysAgo: number
  submitter: 'liza' | 'emmanuel'
  /** Where the expense ends up. */
  flow: 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'SIGNED_OFF' | 'REJECTED'
  receipt: boolean
  /** Who signs off a SIGNED_OFF expense; defaults to the Program Manager. */
  signer?: 'PROGRAM_MANAGER' | 'GRANT_MANAGER'
  /** Review stage that rejects a REJECTED expense; defaults to VERIFY. */
  rejectStage?: 'VERIFY' | 'APPROVE'
  reason?: string
}

export const demoExpenses: DemoExpense[] = [
  {
    project: 'SSG',
    activityKey: 'baseline',
    description: 'Tablet data collection allowance for 12 enumerators, six barangays',
    amount: '42000.00',
    daysAgo: 58,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'SSG',
    activityKey: 'orientation',
    description: 'Venue rental and snacks for six barangay orientation sessions',
    amount: '38500.00',
    daysAgo: 52,
    submitter: 'liza',
    flow: 'APPROVED',
    receipt: true,
  },
  {
    project: 'SSG',
    activityKey: 'orientation',
    description:
      'Printed child protection materials and snacks for follow-up orientation in Maypangdan',
    amount: '51750.00',
    daysAgo: 47,
    submitter: 'liza',
    flow: 'APPROVED',
    receipt: true,
  },
  {
    project: 'SSG',
    activityKey: 'returnedproof',
    description: 'Venue, meals and materials for peer educator training day 1',
    amount: '64400.00',
    daysAgo: 34,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'GRANT_MANAGER',
  },
  {
    project: 'SSG',
    activityKey: 'returnedproof',
    description: 'Honoraria for two peer educator trainers',
    amount: '50000.00',
    daysAgo: 27,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'SSG',
    budgetCategory: 'Project staff travel',
    description: 'Fuel and van rental for monthly monitoring visits to partner schools',
    amount: '44350.00',
    daysAgo: 19,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'SSG',
    activityKey: 'lifeskills',
    description: 'Printed activity sheets and art materials for sessions 1 to 6',
    amount: '27350.00',
    daysAgo: 26,
    submitter: 'liza',
    flow: 'VERIFIED',
    receipt: true,
  },
  {
    project: 'SSG',
    activityKey: 'kits',
    description: 'Partial payment to supplier for 150 school bags',
    amount: '96000.00',
    daysAgo: 16,
    submitter: 'liza',
    flow: 'SUBMITTED',
    receipt: true,
  },
  {
    project: 'SSG',
    activityKey: 'referral',
    description: 'Meals and transport for referral mapping meetings with municipal offices',
    amount: '9800.00',
    daysAgo: 4,
    submitter: 'liza',
    flow: 'VERIFIED',
    receipt: true,
  },
  {
    project: 'SSG',
    budgetCategory: 'Project staff travel',
    description: 'Van rental for monitoring visit, Borongan to Llorente',
    amount: '8500.00',
    daysAgo: 14,
    submitter: 'liza',
    flow: 'REJECTED',
    receipt: false,
    rejectStage: 'VERIFY',
    reason: 'The receipt is missing and the rental dates do not match the visit schedule.',
  },
  {
    project: 'CRL',
    description: 'Training venue, meals and first aid supplies for five barangay teams',
    amount: '118400.00',
    daysAgo: 56,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'CRL',
    description: 'Abaca stripping tools for 20 households, Bocsol and Dalakit',
    amount: '312000.00',
    daysAgo: 24,
    submitter: 'emmanuel',
    flow: 'APPROVED',
    receipt: true,
  },
  {
    project: 'CRL',
    description: 'Starter grants first tranche to 20 households, Bocsol and Dalakit',
    amount: '1250000.00',
    daysAgo: 41,
    submitter: 'emmanuel',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'GRANT_MANAGER',
  },
  {
    project: 'CRL',
    description: 'Coconut by-product processing equipment for six household groups',
    amount: '985000.00',
    daysAgo: 30,
    submitter: 'emmanuel',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'CRL',
    description: 'Early warning radios, life vests and rescue kits for five response teams',
    amount: '278600.00',
    daysAgo: 12,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'CRL',
    description: 'Transport and meals for monthly monitoring visits to Bocsol and Dalakit',
    amount: '18750.00',
    daysAgo: 3,
    submitter: 'emmanuel',
    flow: 'SUBMITTED',
    receipt: true,
  },
  {
    project: 'CRL',
    description: 'Printing and venue for enterprise record keeping coaching, Bocsol',
    amount: '185000.00',
    daysAgo: 9,
    submitter: 'emmanuel',
    flow: 'VERIFIED',
    receipt: true,
  },
  {
    project: 'CRL',
    description: 'Second billing for abaca stripping tools already paid in full',
    amount: '96500.00',
    daysAgo: 15,
    submitter: 'emmanuel',
    flow: 'REJECTED',
    receipt: true,
    rejectStage: 'APPROVE',
    reason:
      'This invoice duplicates the supplier invoice already paid for the stripping tools, so the second payment is not allowable.',
  },
  {
    project: 'ALS',
    description: 'Printing of learner modules for cycle 1',
    amount: '154800.00',
    daysAgo: 60,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'ALS',
    description: 'Honoraria of 24 learning facilitators, final payment',
    amount: '190000.00',
    daysAgo: 50,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'GRANT_MANAGER',
  },
  {
    project: 'ALS',
    description: 'Learner modules and review materials for cycle 2',
    amount: '640000.00',
    daysAgo: 38,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'ALS',
    description: 'Learning center rent, utilities and learner snacks for review classes',
    amount: '495200.00',
    daysAgo: 22,
    submitter: 'liza',
    flow: 'APPROVED',
    receipt: true,
  },
  {
    project: 'ALS',
    description: 'Cash advance for accreditation and equivalency assessment registration fees',
    amount: '12000.00',
    daysAgo: 2,
    submitter: 'liza',
    flow: 'SUBMITTED',
    receipt: false,
  },
  {
    project: 'WSH',
    description: 'Cement, hollow blocks and PVC pipes for four school sites',
    amount: '486200.00',
    daysAgo: 60,
    submitter: 'emmanuel',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'WSH',
    description: 'Plumbing fixtures and roofing sheets for six school sites',
    amount: '912300.00',
    daysAgo: 44,
    submitter: 'emmanuel',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'GRANT_MANAGER',
  },
  {
    project: 'WSH',
    description: 'Contractor progress billing for school sites 7 to 9',
    amount: '1184000.00',
    daysAgo: 29,
    submitter: 'emmanuel',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'WSH',
    description: 'Venue, meals and materials for school hygiene club training',
    amount: '200000.00',
    daysAgo: 10,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'GRANT_MANAGER',
  },
  {
    project: 'EHK',
    description: 'Procurement of 450 hygiene and learning kits',
    amount: '520000.00',
    daysAgo: 59,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
  {
    project: 'EHK',
    description: 'Hauling, packing and distribution logistics in three barangays',
    amount: '300000.00',
    daysAgo: 52,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'GRANT_MANAGER',
  },
  {
    project: 'EHK',
    description: 'Distribution monitoring, acknowledgment lists and liquidation',
    amount: '120800.00',
    daysAgo: 46,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
    signer: 'PROGRAM_MANAGER',
  },
]

export type DemoRule = {
  project: ProjectKey
  code: string
  name: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  conditions: Array<{
    metric:
      | 'PROJECT_TIMELINE_ELAPSED_PERCENT'
      | 'ACTIVITY_COMPLETION_PERCENT'
      | 'ACTIVITY_OVERDUE_COUNT'
      | 'PROJECT_REMAINING_DAYS'
      | 'PROJECT_OVERDUE_DAYS'
      | 'BUDGET_UTILIZATION_PERCENT'
      | 'BENEFICIARY_FOLLOW_UP_PERCENT'
      | 'SURVEY_MEAN_IMPROVEMENT_POINTS'
    operator: 'LT' | 'LTE' | 'EQ' | 'GTE' | 'GT'
    threshold: string
  }>
  mode: 'AND' | 'OR'
  recommendations: Array<{ title: string; text: string }>
}

export const demoRules: DemoRule[] = [
  {
    project: 'WSH',
    code: 'OPERATIONS_BOTTLENECK',
    name: 'Operations Bottleneck',
    severity: 'HIGH',
    mode: 'AND',
    conditions: [
      { metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT', operator: 'GT', threshold: '50' },
      { metric: 'ACTIVITY_COMPLETION_PERCENT', operator: 'LT', threshold: '40' },
    ],
    recommendations: [
      {
        title: 'Hold a recovery planning meeting',
        text: 'Convene the project team and partners to agree on a recovery plan for the delayed activities, with revised dates and owners.',
      },
      {
        title: 'Request a no-cost timeline extension',
        text: 'Prepare a justification for a no-cost extension so that the remaining construction can be completed after the rainy season.',
      },
    ],
  },
  {
    project: 'WSH',
    code: 'PROJECT_PAST_END_DATE',
    name: 'Project past its end date',
    severity: 'CRITICAL',
    mode: 'AND',
    conditions: [{ metric: 'PROJECT_OVERDUE_DAYS', operator: 'GT', threshold: '0' }],
    recommendations: [
      {
        title: 'Review the closure plan with the donor',
        text: 'Agree with the grant manager on a revised end date and a closure checklist before further spending is approved.',
      },
    ],
  },
  {
    project: 'SSG',
    code: 'ACTIVITY_DELAYS',
    name: 'Multiple activities behind schedule',
    severity: 'MEDIUM',
    mode: 'AND',
    conditions: [{ metric: 'ACTIVITY_OVERDUE_COUNT', operator: 'GTE', threshold: '2' }],
    recommendations: [
      {
        title: 'Reschedule delayed activities',
        text: 'Ask the project officer to submit revised dates for each delayed activity and record the reason for the delay.',
      },
      {
        title: 'Reassign field support',
        text: 'Consider temporary field support from the Northern Samar team for the referral pathway mapping.',
      },
    ],
  },
  {
    project: 'ALS',
    code: 'CLOSING_SOON',
    name: 'Project closing within 30 days',
    severity: 'LOW',
    mode: 'AND',
    conditions: [{ metric: 'PROJECT_REMAINING_DAYS', operator: 'LT', threshold: '30' }],
    recommendations: [
      {
        title: 'Start the close-out checklist',
        text: 'Begin the close-out checklist: final indicator readings, expense clearance, asset handover and the learning review workshop.',
      },
    ],
  },
  {
    project: 'CRL',
    code: 'ACTIVITY_DELAYS_WATCH',
    name: 'Watch: activity delays',
    severity: 'LOW',
    mode: 'AND',
    conditions: [{ metric: 'ACTIVITY_OVERDUE_COUNT', operator: 'GT', threshold: '3' }],
    recommendations: [
      {
        title: 'Discuss workload at the next coordination meeting',
        text: 'Review field workload with the project officers if activity delays start to accumulate.',
      },
    ],
  },
  {
    project: 'CRL',
    code: 'BUDGET_NEAR_EXHAUSTED',
    name: 'Approved spending near the planned budget',
    severity: 'HIGH',
    mode: 'AND',
    conditions: [{ metric: 'BUDGET_UTILIZATION_PERCENT', operator: 'GTE', threshold: '90' }],
    recommendations: [
      {
        title: 'Review the remaining budget with the Grant Manager',
        text: 'Compare the unspent balance with the activities still planned and agree on which costs are paused or reallocated.',
      },
      {
        title: 'Pause new grant tranches until the budget is reviewed',
        text: 'Hold approval of further grant tranches until the revised spending plan is confirmed.',
      },
    ],
  },
  {
    project: 'CRL',
    code: 'FOLLOW_UP_GAP',
    name: 'Beneficiaries needing follow-up',
    severity: 'MEDIUM',
    mode: 'AND',
    conditions: [{ metric: 'BENEFICIARY_FOLLOW_UP_PERCENT', operator: 'GTE', threshold: '25' }],
    recommendations: [
      {
        title: 'Schedule household follow-up visits',
        text: 'Assign field officers to visit the participants marked for follow-up and record the outcome of each visit.',
      },
    ],
  },
  {
    project: 'WSH',
    code: 'LOW_SURVEY_IMPROVEMENT',
    name: 'Low improvement in survey results',
    severity: 'MEDIUM',
    mode: 'AND',
    conditions: [{ metric: 'SURVEY_MEAN_IMPROVEMENT_POINTS', operator: 'LT', threshold: '20' }],
    recommendations: [
      {
        title: 'Review the hygiene club training content',
        text: 'Review the training sessions with the facilitators and strengthen the topics where learners improved least.',
      },
    ],
  },
  {
    project: 'CRL',
    code: 'ACTIVITY_OVERDUE_ANY',
    name: 'An activity is past its planned end date',
    severity: 'MEDIUM',
    mode: 'AND',
    conditions: [{ metric: 'ACTIVITY_OVERDUE_COUNT', operator: 'GTE', threshold: '1' }],
    recommendations: [
      {
        title: 'Confirm a new date for the overdue activity',
        text: 'Ask the assigned officer to confirm a revised date and record the reason the activity is late.',
      },
    ],
  },
]

export type DemoMilestone = {
  project: ProjectKey
  title: string
  description: string
  /** Days from the run date. */
  targetOffset: number
  /** Completion offset from the run date, when the milestone is completed. */
  completedOffset?: number
}

export const demoMilestones: DemoMilestone[] = [
  {
    project: 'SSG',
    title: 'Baseline results validated',
    description: 'Baseline findings presented to partners.',
    targetOffset: -120,
    completedOffset: -125,
  },
  {
    project: 'SSG',
    title: 'School protection committees organized in six barangays',
    description: 'Committees formally organized and oriented.',
    targetOffset: -90,
    completedOffset: -84,
  },
  {
    project: 'SSG',
    title: 'Midpoint review with the Department of Education',
    description: 'Joint midpoint review of progress and risks.',
    targetOffset: -30,
    completedOffset: -12,
  },
  {
    project: 'SSG',
    title: 'Learning kit distribution completed',
    description: 'All targeted girls received their kits.',
    targetOffset: -5,
  },
  {
    project: 'SSG',
    title: 'Year-end results workshop',
    description: 'Results and learning workshop with partners.',
    targetOffset: 90,
  },
  {
    project: 'ALS',
    title: 'Learning centers opened in four barangays',
    description: 'All four centers operating.',
    targetOffset: -280,
    completedOffset: -282,
  },
  {
    project: 'ALS',
    title: 'Cycle 1 module completion',
    description: 'First module set completed by learners.',
    targetOffset: -100,
    completedOffset: -96,
  },
  {
    project: 'ALS',
    title: 'Accreditation and equivalency assessment taken',
    description: 'Learners take the assessment.',
    targetOffset: 10,
  },
  {
    project: 'WSH',
    title: 'Facility assessment report approved',
    description: 'Assessment report approved by the schools division.',
    targetOffset: -350,
    completedOffset: -351,
  },
  {
    project: 'WSH',
    title: 'Half of the schools handed over',
    description: 'Six schools with completed facilities.',
    targetOffset: -120,
    completedOffset: -70,
  },
  {
    project: 'WSH',
    title: 'All twelve schools handed over',
    description: 'All facilities handed over.',
    targetOffset: -30,
  },
  {
    project: 'CRL',
    title: 'Barangay response teams organized',
    description: 'Five teams formally organized.',
    targetOffset: -60,
    completedOffset: -58,
  },
  {
    project: 'CRL',
    title: 'First livelihood group cohort supported',
    description: '20 households received grants and coaching.',
    targetOffset: -10,
  },
  {
    project: 'EHK',
    title: 'Kits delivered to all three barangays',
    description: 'Distribution completed.',
    targetOffset: -150,
    completedOffset: -152,
  },
]

export const forbiddenVisibleWords = [
  'test',
  'demo',
  'sample',
  'dummy',
  'synthetic',
  'lorem',
  'ipsum',
  'foo',
  'bar',
  'placeholder',
  'fake',
  'mock',
  'asdf',
]

/** Every user-visible string in the static content, for the content guard test. */
export function visibleStrings(): string[] {
  const out: string[] = []
  for (const program of demoPrograms) out.push(program.name, program.description)
  for (const project of demoProjects) {
    out.push(
      project.title,
      project.description,
      project.objectives,
      project.implementationArea,
      project.sector,
    )
    out.push(...project.partners, ...project.barangays)
  }
  for (const list of Object.values(demoActivities))
    for (const activity of list)
      out.push(
        activity.title,
        activity.type,
        activity.description,
        activity.note ?? '',
        activity.reviewNote ?? '',
        activity.reason ?? '',
        activity.explanation ?? '',
      )
  for (const list of Object.values(demoIndicators))
    for (const indicator of list) out.push(indicator.name, indicator.unit)
  for (const list of Object.values(demoBudgets))
    for (const line of list ?? []) out.push(line.category, line.remarks ?? '')
  for (const expense of demoExpenses) out.push(expense.description, expense.reason ?? '')
  for (const rule of demoRules) {
    out.push(rule.name)
    for (const item of rule.recommendations) out.push(item.title, item.text)
  }
  for (const milestone of demoMilestones) out.push(milestone.title, milestone.description)
  out.push(...femaleFirstNames, ...maleFirstNames, ...middleNames, ...lastNames)
  return out.filter(Boolean)
}

// Form definitions shared by the seed and by the fixture tests.
export type DemoFormField = {
  code: string
  label: string
  dataType:
    | 'TEXT'
    | 'LONG_TEXT'
    | 'INTEGER'
    | 'DECIMAL'
    | 'DATE'
    | 'BOOLEAN'
    | 'SELECT'
    | 'MULTIPLE_SELECT'
  required: boolean
  metadataKey: boolean
  sadddField: boolean
  allowedValues?: string[]
  minimumValue?: string
  maximumValue?: string
  minimumLength?: number
  maximumLength?: number
}

const field = (
  code: string,
  label: string,
  dataType: DemoFormField['dataType'],
  patch: Partial<DemoFormField> = {},
): DemoFormField => ({
  code,
  label,
  dataType,
  required: false,
  metadataKey: false,
  sadddField: false,
  ...patch,
})

/** Household Profile: the published form the household follow-up import file maps to. */
export const householdProfileFields: DemoFormField[] = [
  field('beneficiary_code', 'Beneficiary code', 'TEXT', { required: true, metadataKey: true }),
  field('household_size', 'Household size', 'INTEGER', {
    required: true,
    minimumValue: '1',
    maximumValue: '30',
  }),
  field('children_in_school', 'Children in school', 'INTEGER', {
    minimumValue: '0',
    maximumValue: '20',
  }),
  field('main_income_source', 'Main income source', 'SELECT', {
    required: true,
    allowedValues: ['Farming', 'Fishing', 'Small business', 'Wage labor', 'Remittances', 'Other'],
  }),
  field('monthly_income_range', 'Monthly income range', 'SELECT', {
    allowedValues: ['Below 5,000', '5,000 to 9,999', '10,000 to 14,999', '15,000 and above'],
  }),
  field('has_toilet', 'Has toilet', 'BOOLEAN'),
  field('visit_date', 'Visit date', 'DATE', { required: true }),
  field('remarks', 'Remarks', 'LONG_TEXT', { maximumLength: 2000 }),
]

export const attendanceFields: DemoFormField[] = [
  field('beneficiary_code', 'Beneficiary code', 'TEXT', { required: true, metadataKey: true }),
  field('participation_date', 'Participation date', 'DATE', { required: true }),
  field('attendance_status', 'Attendance status', 'SELECT', {
    required: true,
    allowedValues: ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'],
  }),
  field('progress_status', 'Progress status', 'SELECT', {
    required: true,
    allowedValues: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP'],
  }),
  field('progress_notes', 'Progress notes', 'LONG_TEXT', { maximumLength: 2000 }),
]
