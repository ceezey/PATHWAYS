import { type ProjectKey, addDaysIso } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

export const registrationHeaders = [
  'Registration operation',
  'Beneficiary code',
  'Subject type',
  'First name',
  'Middle name',
  'Last name',
  'Sex',
  'Birth date',
  'Disability status',
  'Barangay',
  'City or municipality',
  'Province',
  'Participation consent',
  'Data processing consent',
  'Minor status',
  'Guardian consent',
  'Enrollment date',
]

type HistoricRow = {
  code: string
  first: string
  middle: string
  last: string
  sex: 'MALE' | 'FEMALE'
  birth: string
  barangay: string
  enrolledOffset: number
  /** A deliberately invalid row that validation rejects and keeps staged with its error. */
  fault?: 'BAD_DATE' | 'NO_CONSENT'
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

function csvBuffer(
  project: { municipality: string; province: string },
  rows: HistoricRow[],
  today: string,
) {
  const lines = [registrationHeaders.map(csvCell).join(',')]
  for (const row of rows) {
    const enrolled = addDaysIso(today, row.enrolledOffset)
    const year = Number(enrolled.slice(0, 4)) - Number(row.birth.slice(0, 4))
    const minor = year < 18
    lines.push(
      [
        'CREATE',
        row.code,
        'INDIVIDUAL',
        row.first,
        row.middle,
        row.last,
        row.sex,
        row.fault === 'BAD_DATE' ? row.birth.split('-').reverse().join('/') : row.birth,
        'WITHOUT_DISABILITY',
        row.barangay,
        project.municipality,
        project.province,
        'true',
        row.fault === 'NO_CONSENT' ? '' : 'true',
        String(minor),
        String(minor),
        enrolled,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8')
}

const catarmanBatch: HistoricRow[] = [
  {
    code: 'CAT-2026-001',
    first: 'Mylene',
    middle: 'Cabales',
    last: 'Yabut',
    sex: 'FEMALE',
    birth: '1985-05-04',
    barangay: 'Bocsol',
    enrolledOffset: -60,
  },
  {
    code: 'CAT-2026-002',
    first: 'Arnel',
    middle: 'Dagondon',
    last: 'Cabrera',
    sex: 'MALE',
    birth: '1979-11-22',
    barangay: 'Bocsol',
    enrolledOffset: -60,
  },
  {
    code: 'CAT-2026-003',
    first: 'Rosalie',
    middle: 'Sabalza',
    last: 'Tomarong',
    sex: 'FEMALE',
    birth: '1992-02-13',
    barangay: 'Dalakit',
    enrolledOffset: -59,
  },
  {
    code: 'CAT-2026-004',
    first: 'Marlon',
    middle: 'Evardone',
    last: 'Lumen',
    sex: 'MALE',
    birth: '1988-08-30',
    barangay: 'Dalakit',
    enrolledOffset: -59,
  },
  {
    code: 'CAT-2026-005',
    first: 'Jessa',
    middle: 'Quilantang',
    last: 'Marquez',
    sex: 'FEMALE',
    birth: '1996-01-17',
    barangay: 'Baybay',
    enrolledOffset: -58,
  },
  {
    code: 'CAT-2026-006',
    first: 'Gilbert',
    middle: 'Ogayon',
    last: 'Abesamis',
    sex: 'MALE',
    birth: '1972-06-09',
    barangay: 'Baybay',
    enrolledOffset: -58,
  },
  {
    code: 'CAT-2026-007',
    first: 'Lea',
    middle: 'Espina',
    last: 'Cinco',
    sex: 'FEMALE',
    birth: '1990-12-28',
    barangay: 'Cawayan',
    enrolledOffset: -57,
  },
  {
    code: 'CAT-2026-008',
    first: 'Ferdinand',
    middle: 'Nacional',
    last: 'Alcala',
    sex: 'MALE',
    birth: '1983-03-15',
    barangay: 'Cawayan',
    enrolledOffset: -57,
  },
  {
    code: 'CAT-2026-009',
    first: 'Vilma',
    middle: 'Lagrimas',
    last: 'Baldeo',
    sex: 'FEMALE',
    birth: '1965-09-21',
    barangay: 'Lapu-lapu',
    enrolledOffset: -56,
  },
  {
    code: 'CAT-2026-010',
    first: 'Edwin',
    middle: 'Gabon',
    last: 'Tabuena',
    sex: 'MALE',
    birth: '1975-07-02',
    barangay: 'Lapu-lapu',
    enrolledOffset: -56,
  },
  {
    code: 'CAT-2026-011',
    first: 'Analyn',
    middle: 'Tabalba',
    last: 'Cabrera',
    sex: 'FEMALE',
    birth: '1998-04-11',
    barangay: 'Bocsol',
    enrolledOffset: -55,
  },
  {
    code: 'CAT-2026-012',
    first: 'Renato',
    middle: 'Abella',
    last: 'Gabon',
    sex: 'MALE',
    birth: '1969-10-05',
    barangay: 'Dalakit',
    enrolledOffset: -55,
  },
]

const lavezaresBatch: HistoricRow[] = [
  {
    code: 'LAV-2026-001',
    first: 'Jomar',
    middle: 'Cinco',
    last: 'Evardone',
    sex: 'MALE',
    birth: '2007-02-19',
    barangay: 'Macarthur',
    enrolledOffset: -40,
  },
  {
    code: 'LAV-2026-002',
    first: 'Kyla',
    middle: 'Abella',
    last: 'Nacional',
    sex: 'FEMALE',
    birth: '2006-08-07',
    barangay: 'Macarthur',
    enrolledOffset: -40,
  },
  {
    code: 'LAV-2026-003',
    first: 'Danilo',
    middle: 'Ogayon',
    last: 'Quilantang',
    sex: 'MALE',
    birth: '1998-05-26',
    barangay: 'Del Rosario',
    enrolledOffset: -39,
  },
  {
    code: 'LAV-2026-004',
    first: 'Cristina',
    middle: 'Baldeo',
    last: 'Lumen',
    sex: 'FEMALE',
    birth: '2001-11-13',
    barangay: 'Del Rosario',
    enrolledOffset: -39,
  },
  {
    code: 'LAV-2026-005',
    first: 'Alvin',
    middle: 'Lagrimas',
    last: 'Yabut',
    sex: 'MALE',
    birth: '1994-09-03',
    barangay: 'Poblacion',
    enrolledOffset: -38,
  },
  {
    code: 'LAV-2026-006',
    first: 'Nova',
    middle: 'Espina',
    last: 'Marquez',
    sex: 'FEMALE',
    birth: '2003-01-30',
    barangay: 'Poblacion',
    enrolledOffset: -38,
  },
  // Faults kept for review: a birth date written day first and a blank data processing consent.
  {
    code: 'LAV-2026-007',
    first: 'Ryan',
    middle: 'Gabon',
    last: 'Sabalza',
    sex: 'MALE',
    birth: '2008-06-14',
    barangay: 'San Isidro',
    enrolledOffset: -37,
    fault: 'BAD_DATE',
  },
  {
    code: 'LAV-2026-008',
    first: 'Hazel',
    middle: 'Alcala',
    last: 'Dagondon',
    sex: 'FEMALE',
    birth: '2010-03-09',
    barangay: 'San Isidro',
    enrolledOffset: -37,
    fault: 'NO_CONSENT',
  },
]

type Batch = {
  id: string
  status?: string
  mappingRevision?: number
  validationRevision?: number
  [key: string]: unknown
}

async function runImport(
  ctx: DemoContext,
  projectKey: ProjectKey,
  label: string,
  fileName: string,
  buffer: Buffer,
) {
  const projectId = projectOf(ctx, projectKey)
  const me = ctx.staff.me.identity
  const registration = await ctx.services.beneficiaries.ensureDefaultRegistrationForm(
    ctx.staff.liza.identity,
    projectId,
  )
  const formId = registration.definitions[0]?.id
  if (!formId) throw new Error('Registration form is unavailable.')
  const listed = (await ctx.services.imports.listBatches(me, projectId)) as unknown as Array<{
    id: string
    originalFileName: string
    status: string
  }>
  let batchId = listed.find((batch) => batch.originalFileName === fileName)?.id
  let status = listed.find((batch) => batch.originalFileName === fileName)?.status
  if (!batchId) {
    const uploaded = (await step(`${label}: upload`, () =>
      ctx.services.imports.upload(
        me,
        projectId,
        { formId, clientImportId: ctx.stable(`import:${fileName}`) },
        { buffer, originalname: fileName, mimetype: 'text/csv', size: buffer.length },
      ),
    )) as unknown as Batch
    batchId = uploaded.id
    status = uploaded.status
  }
  const id = batchId as string
  // Resume from the batch's current state so reruns finish an interrupted import.
  if (status === 'UPLOADED') {
    await step(`${label}: automatic mapping`, () =>
      ctx.services.imports.automaticMapping(me, projectId, id, { expectedMappingRevision: 0 }),
    )
    status = 'MAPPED'
  }
  if (status === 'MAPPED') {
    const current = (await ctx.services.imports.getBatch(me, projectId, id)) as unknown as Batch
    await step(`${label}: validate`, () =>
      ctx.services.imports.validate(me, projectId, id, {
        expectedMappingRevision: current.mappingRevision as number,
      }),
    )
    status = 'VALIDATED'
  }
  if (status === 'VALIDATED') {
    const validated = (await ctx.services.imports.getBatch(me, projectId, id)) as unknown as Batch
    await step(`${label}: process`, () =>
      ctx.services.imports.process(me, projectId, id, {
        expectedValidationRevision: validated.validationRevision as number,
      }),
    )
    return true
  }
  return false
}

/** Import history: one batch that promoted every row, and one that kept two faulty rows staged
 * with their errors. Both go through automatic mapping, validation and processing. */
export async function stageImports(ctx: DemoContext) {
  const done = [
    await runImport(
      ctx,
      'CRL',
      'Catarman registration batch',
      'catarman-livelihood-participants.csv',
      csvBuffer({ municipality: 'Catarman', province: 'Northern Samar' }, catarmanBatch, ctx.today),
    ),
    await runImport(
      ctx,
      'ALS',
      'Lavezares registration batch',
      'lavezares-learner-enrollment.csv',
      csvBuffer(
        { municipality: 'Lavezares', province: 'Northern Samar' },
        lavezaresBatch,
        ctx.today,
      ),
    ),
  ]
  ctx.log(`  import batches processed: ${done.filter(Boolean).length}`)
}
