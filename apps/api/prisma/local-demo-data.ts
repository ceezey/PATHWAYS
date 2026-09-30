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
    targetBeneficiaries: 1200,
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
    targetBeneficiaries: 800,
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
    targetBeneficiaries: 300,
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
    targetBeneficiaries: 60,
    projectBudget: '450000.00',
    partners: ['Masbate City Social Welfare and Development Office'],
    startOffset: -120,
    endOffset: 245,
    status: 'ONGOING',
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
    targetBeneficiaries: 900,
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
    targetBeneficiaries: 450,
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
  budget: string
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
      target: 320,
      budget: '180000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'All 320 household interviews and 14 school head interviews completed; data entry verified.',
      reviewNote: 'Household coverage confirmed against the survey plan.',
      reached: 320,
    },
    {
      key: 'orientation',
      title: 'Barangay orientation on child protection and school safety',
      type: 'Community Engagement',
      description:
        'Orientation sessions for barangay councils, parents and school heads on safe school practices and referral routes.',
      startOffset: -130,
      endOffset: -105,
      target: 240,
      budget: '95000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Six orientation sessions held; attendance sheets and photos submitted.',
      reviewNote: 'Attendance sheets match the planned participant lists.',
      reached: 236,
    },
    {
      key: 'lifeskills',
      title: 'Girls life skills and leadership sessions',
      type: 'Capacity Building',
      description:
        'Weekly life skills and leadership sessions for adolescent girls in partner schools.',
      startOffset: -60,
      endOffset: 45,
      target: 180,
      budget: '260000.00',
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 55,
      note: 'Sessions 1 to 6 completed in Songco, Sabang and Maypangdan; 96 girls attended regularly.',
      reviewNote: 'Progress matches the session attendance records.',
      reached: 96,
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
      budget: '45000.00',
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
      target: 500,
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
      target: 400,
      budget: '210000.00',
      outcome: 'COMPLETED',
      officer: 'emmanuel',
      progress: 100,
      note: 'Assessment forms collected from 404 households.',
      reviewNote: 'Coverage and household selection verified.',
      reached: 404,
    },
    {
      key: 'drrm',
      title: 'Barangay disaster response team training',
      type: 'Capacity Building',
      description:
        'Training of barangay disaster response teams on early warning, evacuation and first aid.',
      startOffset: -90,
      endOffset: -40,
      target: 100,
      budget: '240000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Five barangay teams completed the three-day training.',
      reviewNote: 'Certificates and attendance verified.',
      reached: 98,
    },
    {
      key: 'livelihood',
      title: 'Abaca and coconut by-product livelihood grants',
      type: 'Livelihood Support',
      description:
        'Starter grants and coaching for household enterprises in abaca and coconut processing.',
      startOffset: -30,
      endOffset: 60,
      target: 150,
      budget: '900000.00',
      outcome: 'PROGRESS_VERIFIED',
      officer: 'emmanuel',
      progress: 40,
      note: '60 households received grants and coaching in Bocsol and Dalakit.',
      reviewNote: 'Grant acknowledgment receipts match the beneficiary list.',
      reached: 60,
    },
    {
      key: 'savings',
      title: 'Community savings group formation',
      type: 'Livelihood Support',
      description: 'Formation and coaching of village savings and loan associations.',
      startOffset: 15,
      endOffset: 120,
      target: 200,
      budget: '180000.00',
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
      budget: '40000.00',
      outcome: 'IN_PROGRESS',
      officer: 'emmanuel',
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
      target: 300,
      budget: '150000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: '312 out-of-school youth mapped and 287 enrolled in learning centers.',
      reviewNote: 'Enrollment list reconciled with the mapping records.',
      reached: 287,
    },
    {
      key: 'facilitators',
      title: 'Learning facilitator training',
      type: 'Capacity Building',
      description: 'Training of community learning facilitators on the ALS curriculum.',
      startOffset: -270,
      endOffset: -230,
      target: 24,
      budget: '190000.00',
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
      target: 287,
      budget: '640000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Cycle 1 concluded with 251 learners completing the module set.',
      reviewNote: 'Session logs and completion list verified.',
      reached: 251,
    },
    {
      key: 'reviewclass',
      title: 'Accreditation and equivalency exam review classes',
      type: 'Education Delivery',
      description: 'Review classes before the accreditation and equivalency assessment.',
      startOffset: -60,
      endOffset: 10,
      target: 251,
      budget: '380000.00',
      outcome: 'PROGRESS_VERIFIED',
      officer: 'liza',
      progress: 85,
      note: 'Review classes are in the final two weeks; 214 learners attend regularly.',
      reviewNote: 'Attendance sheets match the reported figure.',
      reached: 214,
    },
    {
      key: 'closeout',
      title: 'Project close-out and learning review workshop',
      type: 'Review',
      description: 'Close-out workshop with partners to document results and lessons.',
      startOffset: 7,
      endOffset: 18,
      target: 40,
      budget: '90000.00',
      outcome: 'NOT_STARTED',
      officer: 'liza',
    },
  ],
  ECD: [
    {
      key: 'parenting',
      title: 'Parenting sessions for caregivers of children under five',
      type: 'Capacity Building',
      description: 'Bi-weekly parenting sessions for caregivers in four barangays.',
      startOffset: -60,
      endOffset: 90,
      target: 40,
      budget: '150000.00',
      outcome: 'PROGRESS_VERIFIED',
      officer: 'emmanuel',
      progress: 35,
      note: 'Five parenting sessions completed with five caregiver-child pairs.',
      reviewNote: 'Attendance sheets verified.',
      reached: 5,
    },
    {
      key: 'play',
      title: 'Community play and stimulation corners setup',
      type: 'Infrastructure',
      description:
        'Setup of play and stimulation corners in two community child development centers.',
      startOffset: -30,
      endOffset: 20,
      target: 2,
      budget: '95000.00',
      outcome: 'IN_PROGRESS',
      officer: 'emmanuel',
    },
    {
      key: 'homevisit',
      title: 'Home visits for developmental screening',
      type: 'Monitoring',
      description: 'Home visits to screen developmental milestones of enrolled children.',
      startOffset: 15,
      endOffset: 100,
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
      budget: '120000.00',
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
      endOffset: -60,
      target: 12,
      budget: '1650000.00',
      outcome: 'OVERDUE_EXPLAINED',
      officer: 'emmanuel',
      category: 'WEATHER',
      explanation:
        'Two typhoons in the last quarter flooded four school sites and construction materials could not be delivered until the roads reopened.',
    },
    {
      key: 'hygiene',
      title: 'School hygiene club formation and training',
      type: 'Capacity Building',
      description: 'Formation and training of hygiene clubs in each partner school.',
      startOffset: -200,
      endOffset: -45,
      target: 360,
      budget: '380000.00',
      outcome: 'OVERDUE_OPEN',
      officer: 'liza',
    },
    {
      key: 'handover',
      title: 'Facility handover and maintenance plan signing',
      type: 'Coordination',
      description: 'Handover ceremonies and signing of maintenance plans with school heads.',
      startOffset: -30,
      endOffset: -5,
      target: 12,
      budget: '60000.00',
      outcome: 'NOT_STARTED',
      officer: 'emmanuel',
    },
  ],
  EHK: [
    {
      key: 'procure',
      title: 'Procurement of hygiene and learning kits',
      type: 'Procurement',
      description: 'Procurement of 450 hygiene and learning kits.',
      startOffset: -290,
      endOffset: -250,
      target: 450,
      budget: '520000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'All 450 kits procured and delivered to the Guiuan warehouse.',
      reviewNote: 'Delivery receipts verified.',
      reached: 450,
    },
    {
      key: 'distribute',
      title: 'Kit distribution to families in three barangays',
      type: 'Distribution',
      description: 'Distribution of kits in Sulangan, Salug and Bungtod.',
      startOffset: -245,
      endOffset: -150,
      target: 450,
      budget: '300000.00',
      outcome: 'COMPLETED',
      officer: 'liza',
      progress: 100,
      note: 'Kits distributed to 447 families; signed acknowledgment lists submitted.',
      reviewNote: 'Acknowledgment lists reconciled with the beneficiary registry.',
      reached: 447,
    },
  ],
}

/** Beneficiary cohorts: how many people to register per project and how ages are spread. */
export type DemoCohort = {
  count: number
  /** Repeating age pattern; the cohort cycles through it. */
  ages: number[]
  femaleShare: number
}

export const demoCohorts: Record<ProjectKey, DemoCohort> = {
  SSG: {
    count: 42,
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
  ALS: { count: 24, ages: [17, 19, 22, 25, 18, 30, 21, 16, 27, 35, 20, 24], femaleShare: 0.55 },
  ECD: { count: 5, ages: [5, 6, 5, 34, 29], femaleShare: 0.6 },
  WSH: { count: 20, ages: [8, 9, 10, 11, 12, 7, 6, 41, 35, 50], femaleShare: 0.5 },
  EHK: { count: 16, ages: [6, 7, 8, 9, 10, 11, 12, 13, 38, 44], femaleShare: 0.55 },
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
    const enrollOffset = Math.min(
      20 + index * 3,
      Math.max(20, daysBetween(projectStart, today) - 10),
    )
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

export type DemoIndicator = {
  code: string
  name: string
  unit: string
  numericKind: 'COUNT' | 'PERCENTAGE' | 'NON_NEGATIVE'
  baseline: string
  target: string
  /** Successive readings, oldest first. */
  readings: string[]
}

export const demoIndicators: Record<ProjectKey, DemoIndicator[]> = {
  SSG: [
    {
      code: 'SSG-GIRLS-ENR',
      name: 'Girls reached with school protection activities',
      unit: 'girls',
      numericKind: 'COUNT',
      baseline: '0',
      target: '900',
      readings: ['120', '260', '410', '535'],
    },
    {
      code: 'SSG-ATT-RATE',
      name: 'Regular school attendance rate of girls',
      unit: 'percent',
      numericKind: 'PERCENTAGE',
      baseline: '68.00',
      target: '90.00',
      readings: ['70.50', '73.20', '76.80', '79.40'],
    },
    {
      code: 'SSG-COMM-FUNC',
      name: 'School protection committees functioning',
      unit: 'committees',
      numericKind: 'COUNT',
      baseline: '2',
      target: '14',
      readings: ['3', '5', '8'],
    },
  ],
  CRL: [
    {
      code: 'CRL-HH-DIV',
      name: 'Households with two or more income sources',
      unit: 'households',
      numericKind: 'COUNT',
      baseline: '95',
      target: '520',
      readings: ['140', '205', '268'],
    },
    {
      code: 'CRL-DRR-TEAMS',
      name: 'Barangay disaster response teams trained',
      unit: 'teams',
      numericKind: 'COUNT',
      baseline: '0',
      target: '10',
      readings: ['2', '5', '5'],
    },
  ],
  ALS: [
    {
      code: 'ALS-ENROLLED',
      name: 'Out-of-school learners enrolled in learning centers',
      unit: 'learners',
      numericKind: 'COUNT',
      baseline: '0',
      target: '300',
      readings: ['180', '262', '287'],
    },
    {
      code: 'ALS-COMPLETION',
      name: 'Learners completing the module set',
      unit: 'percent',
      numericKind: 'PERCENTAGE',
      baseline: '0.00',
      target: '80.00',
      readings: ['35.00', '62.50', '87.50'],
    },
  ],
  ECD: [
    {
      code: 'ECD-CAREGIVERS',
      name: 'Caregivers attending parenting sessions',
      unit: 'caregivers',
      numericKind: 'COUNT',
      baseline: '0',
      target: '40',
      readings: ['3', '5'],
    },
  ],
  WSH: [
    {
      code: 'WSH-SCHOOLS',
      name: 'Schools with functioning handwashing stations',
      unit: 'schools',
      numericKind: 'COUNT',
      baseline: '1',
      target: '12',
      readings: ['2', '4', '5'],
    },
    {
      code: 'WSH-CLUBS',
      name: 'School hygiene clubs active',
      unit: 'clubs',
      numericKind: 'COUNT',
      baseline: '0',
      target: '12',
      readings: ['1', '3'],
    },
  ],
  EHK: [
    {
      code: 'EHK-FAMILIES',
      name: 'Families receiving hygiene and learning kits',
      unit: 'families',
      numericKind: 'COUNT',
      baseline: '0',
      target: '450',
      readings: ['210', '447'],
    },
  ],
}

export type DemoBudgetLine = {
  category: string
  amount: string
  activityKey?: string
  remarks?: string
}

export const demoBudgets: Partial<Record<ProjectKey, DemoBudgetLine[]>> = {
  SSG: [
    { category: 'Survey and data collection', amount: '180000.00', activityKey: 'baseline' },
    { category: 'Community orientation sessions', amount: '95000.00', activityKey: 'orientation' },
    { category: 'Life skills session materials', amount: '260000.00', activityKey: 'lifeskills' },
    { category: 'Learning kits and hygiene supplies', amount: '320000.00', activityKey: 'kits' },
    {
      category: 'Committee training venue and meals',
      amount: '150000.00',
      activityKey: 'committee',
    },
    {
      category: 'Project staff travel',
      amount: '210000.00',
      remarks: 'Monthly travel to partner schools.',
    },
  ],
  CRL: [
    { category: 'Livelihood starter grants', amount: '900000.00', activityKey: 'livelihood' },
    { category: 'Disaster response team training', amount: '240000.00', activityKey: 'drrm' },
    { category: 'Household assessment', amount: '210000.00', activityKey: 'assessment' },
  ],
  ALS: [
    { category: 'Learning materials and modules', amount: '640000.00', activityKey: 'sessions' },
    { category: 'Facilitator honoraria', amount: '190000.00', activityKey: 'facilitators' },
  ],
  WSH: [
    { category: 'Construction materials', amount: '1650000.00', activityKey: 'rehab' },
    { category: 'Hygiene club training', amount: '380000.00', activityKey: 'hygiene' },
  ],
}

export type DemoExpense = {
  project: ProjectKey
  budgetCategory: string
  description: string
  amount: string
  /** Days before the run date. */
  daysAgo: number
  submitter: 'liza' | 'emmanuel'
  /** Where the expense ends up. */
  flow: 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'SIGNED_OFF' | 'REJECTED'
  receipt: boolean
  reason?: string
}

export const demoExpenses: DemoExpense[] = [
  {
    project: 'SSG',
    budgetCategory: 'Survey and data collection',
    description: 'Tablet data collection allowance for 12 enumerators, six barangays',
    amount: '42000.00',
    daysAgo: 150,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
  },
  {
    project: 'SSG',
    budgetCategory: 'Community orientation sessions',
    description: 'Venue rental and snacks for six barangay orientation sessions',
    amount: '38500.00',
    daysAgo: 112,
    submitter: 'liza',
    flow: 'APPROVED',
    receipt: true,
  },
  {
    project: 'SSG',
    budgetCategory: 'Life skills session materials',
    description: 'Printed activity sheets and art materials for sessions 1 to 6',
    amount: '27350.00',
    daysAgo: 28,
    submitter: 'liza',
    flow: 'VERIFIED',
    receipt: true,
  },
  {
    project: 'SSG',
    budgetCategory: 'Learning kits and hygiene supplies',
    description: 'Partial payment to supplier for 150 school bags',
    amount: '96000.00',
    daysAgo: 21,
    submitter: 'liza',
    flow: 'SUBMITTED',
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
    reason: 'The receipt is missing and the rental dates do not match the visit schedule.',
  },
  {
    project: 'CRL',
    budgetCategory: 'Disaster response team training',
    description: 'Training venue, meals and first aid supplies for five barangay teams',
    amount: '118400.00',
    daysAgo: 62,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
  },
  {
    project: 'CRL',
    budgetCategory: 'Livelihood starter grants',
    description: 'Abaca stripping tools for 60 households, Bocsol and Dalakit',
    amount: '312000.00',
    daysAgo: 24,
    submitter: 'emmanuel',
    flow: 'APPROVED',
    receipt: true,
  },
  {
    project: 'WSH',
    budgetCategory: 'Construction materials',
    description: 'Cement, hollow blocks and PVC pipes for four school sites',
    amount: '486200.00',
    daysAgo: 120,
    submitter: 'emmanuel',
    flow: 'SIGNED_OFF',
    receipt: true,
  },
  {
    project: 'ALS',
    budgetCategory: 'Learning materials and modules',
    description: 'Printing of learner modules for cycle 1',
    amount: '154800.00',
    daysAgo: 210,
    submitter: 'liza',
    flow: 'SIGNED_OFF',
    receipt: true,
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
    description: '60 households received grants and coaching.',
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
