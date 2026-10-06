import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  type SmartMatchDecision,
  type SmartMatchField,
  parseCsv,
  parseWorkbook,
  smartMatchColumns,
} from '@pathways/imports'
import { normalizeImportedRow } from '@pathways/imports/server'
import type { FormFieldValidationContract, SupportedFormFieldType } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { corrections, libraryReadings, manualLibraryTarget } from './defense-demo-stage-monitoring'
import {
  type ProjectKey,
  addDaysIso,
  attendanceFields,
  demoActivities,
  demoBudgets,
  demoCohorts,
  demoExpenses,
  demoIndicators,
  demoMilestones,
  demoProjects,
  demoRules,
  forbiddenVisibleWords,
  householdProfileFields,
  planCohort,
  visibleStrings,
} from './local-demo-data'
import { assertLocalDemoTarget } from './local-demo-target'

const fixtures = path.resolve(__dirname, 'demo-fixtures')
const migration = readFileSync(
  path.resolve(__dirname, 'migrations/0040_default_registration_form/migration.sql'),
  'utf8',
)

/** The system registration form's fixed field set, parsed from migration 0040. */
function registrationFields(): FormFieldValidationContract[] {
  return [
    ...migration.matchAll(
      /^\s+\((\d+),'([a-z_]+)','([^']+)','([A-Z_]+)',(true|false),(true|false),(true|false),(NULL|'(\[[^']*\])')\),?$/gm,
    ),
  ].map((row) => ({
    code: row[2],
    label: row[3],
    dataType: row[4] as SupportedFormFieldType,
    required: row[5] === 'true',
    allowedValues: row[9] ? (JSON.parse(row[9]) as string[]) : null,
  }))
}

const asMatchFields = (fields: readonly FormFieldValidationContract[]): SmartMatchField[] =>
  fields.map((field) => ({
    id: field.code,
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    allowedValues: field.allowedValues ?? null,
  }))

/** Same shape the web preview and the API give the shared matcher. */
function decide(headers: string[], rows: Record<string, unknown>[], fields: SmartMatchField[]) {
  return smartMatchColumns(
    headers.map((header, index) => ({
      key: `column_${String(index + 1).padStart(4, '0')}`,
      columnIndex: index + 1,
      header,
      samples: rows.slice(0, 20).map((row) => row[header]),
    })),
    fields,
  )
}

const read = (name: string) => readFileSync(path.join(fixtures, name), 'utf8')

describe('demo content', () => {
  it('uses no placeholder wording anywhere a person can see it', () => {
    const pattern = new RegExp(`\\b(${forbiddenVisibleWords.join('|')})\\b`, 'i')
    for (const text of visibleStrings()) expect(text, text).not.toMatch(pattern)
    for (const name of [
      'beneficiary-registration-borongan.csv',
      'household-profile-followup.csv',
      'livelihood-followup-structure.csv',
    ])
      expect(read(name), name).not.toMatch(pattern)
  })

  it('covers every lifecycle and review state the demonstration needs', () => {
    const outcomes = new Set(
      Object.values(demoActivities).flatMap((list) => list.map((a) => a.outcome)),
    )
    for (const wanted of [
      'COMPLETED',
      'COMPLETED_LATE',
      'PENDING_REVIEW',
      'RETURNED',
      'PROGRESS_VERIFIED',
      'OVERDUE_EXPLAINED',
      'OVERDUE_OPEN',
      'IN_PROGRESS',
      'NOT_STARTED',
      'CANCELLED',
    ])
      expect(outcomes.has(wanted as never), wanted).toBe(true)
    // One project is past its end date but still ongoing; one is near completion; one completed.
    const overdue = demoProjects.filter((p) => p.status === 'ONGOING' && p.endOffset < 0)
    const nearEnd = demoProjects.filter(
      (p) => p.status === 'ONGOING' && p.endOffset > 0 && p.endOffset <= 30,
    )
    expect(overdue.length).toBeGreaterThanOrEqual(1)
    expect(nearEnd.length).toBeGreaterThanOrEqual(1)
    expect(demoProjects.some((p) => p.status === 'COMPLETED')).toBe(true)
  })

  it('reserves an overdue explanation and a returned proof with the words the reviewers need', () => {
    for (const list of Object.values(demoActivities))
      for (const activity of list) {
        if (['OVERDUE_EXPLAINED', 'COMPLETED_LATE'].includes(activity.outcome))
          expect((activity.explanation ?? '').length).toBeGreaterThanOrEqual(10)
        if (activity.outcome === 'CANCELLED') expect(activity.reason).toBeTruthy()
        if (
          [
            'COMPLETED',
            'COMPLETED_LATE',
            'PENDING_REVIEW',
            'RETURNED',
            'PROGRESS_VERIFIED',
          ].includes(activity.outcome)
        )
          expect(activity.note).toBeTruthy()
      }
  })

  it('keeps every indicator reading inside its numeric domain, with several readings each', () => {
    for (const list of Object.values(demoIndicators))
      for (const indicator of list) {
        if (indicator.readings.length) expect(indicator.readings.length).toBeGreaterThanOrEqual(2)
        for (const value of [indicator.baseline, indicator.target, ...indicator.readings]) {
          expect(Number.isFinite(Number(value))).toBe(true)
          if (indicator.numericKind === 'PERCENTAGE') expect(Number(value)).toBeLessThanOrEqual(100)
        }
      }
  })

  it('links every indicator to real activities of its project', () => {
    for (const [key, list] of Object.entries(demoIndicators))
      for (const indicator of list) {
        expect(indicator.activityKeys.length, indicator.code).toBeGreaterThan(0)
        const keys = new Set(demoActivities[key as ProjectKey].map((a) => a.key))
        for (const activityKey of indicator.activityKeys)
          expect(keys.has(activityKey), `${indicator.code} ${activityKey}`).toBe(true)
      }
  })

  it('explains the project reach from the linked activities and indicators', () => {
    const ehk = demoIndicators.EHK.find((i) => i.code === 'EHK-FAMILIES')
    const distribute = demoActivities.EHK.find((a) => a.key === 'distribute')
    expect(Number(ehk?.readings.at(-1))).toBe(distribute?.reached)
    expect(Number(ehk?.target)).toBe(demoProjects.find((p) => p.key === 'EHK')?.targetBeneficiaries)
  })

  it('keeps the rules structured, within the metric catalog and with predefined recommendations', () => {
    expect(demoRules.some((rule) => rule.code === 'OPERATIONS_BOTTLENECK')).toBe(true)
    expect(demoRules.length).toBeGreaterThanOrEqual(4)
    for (const rule of demoRules) {
      expect(rule.conditions.length).toBeGreaterThan(0)
      expect(rule.recommendations.length).toBeGreaterThan(0)
      expect(rule.code).toMatch(/^[A-Z][A-Z0-9_-]{1,79}$/)
    }
  })
})

describe('defense dataset', () => {
  const all = Object.entries(demoActivities).flatMap(([project, list]) =>
    list.map((activity) => ({ ...activity, project: project as ProjectKey })),
  )
  const count = (outcome: string) => all.filter((a) => a.outcome === outcome).length
  const closed = ['COMPLETED', 'COMPLETED_LATE', 'CANCELLED']
  const open = all.filter((a) => !closed.includes(a.outcome))

  it('mixes activity outcomes across the projects', () => {
    expect(count('COMPLETED_LATE')).toBe(2)
    expect(all.some((a) => a.outcome === 'COMPLETED_LATE' && a.project === 'CRL')).toBe(true)
    expect(count('PENDING_REVIEW')).toBeGreaterThanOrEqual(2)
    expect(count('PENDING_REVIEW')).toBeLessThanOrEqual(3)
    expect(count('RETURNED')).toBe(2)
    expect(count('CANCELLED')).toBe(1)
    expect(count('NOT_STARTED')).toBeGreaterThanOrEqual(3)
    for (const a of all.filter((entry) => entry.outcome === 'COMPLETED_LATE'))
      expect(a.endOffset).toBeLessThan(0)
    for (const a of all.filter((entry) => entry.outcome === 'RETURNED'))
      expect((a.reviewNote ?? '').length).toBeGreaterThanOrEqual(30)
  })

  it('has exactly three overdue open activities, one explained, including one on CRL', () => {
    const overdue = open.filter((a) => a.endOffset < 0)
    expect(overdue).toHaveLength(3)
    expect(overdue.filter((a) => a.outcome === 'OVERDUE_EXPLAINED')).toHaveLength(1)
    expect(overdue.filter((a) => a.outcome === 'OVERDUE_OPEN')).toHaveLength(2)
    expect(overdue.some((a) => a.project === 'CRL')).toBe(true)
  })

  it('keeps open activities from flipping overdue in the next three days', () => {
    for (const a of open) expect(a.endOffset < 0 || a.endOffset > 2, a.key).toBe(true)
  })

  it('has one completed, four ongoing and one planned project', () => {
    const status = (value: string) => demoProjects.filter((p) => p.status === value)
    expect(status('COMPLETED').map((p) => p.key)).toEqual(['EHK'])
    expect(status('COMPLETED')[0].endOffset).toBeLessThan(0)
    expect(status('PLANNED')).toHaveLength(1)
    expect(status('ONGOING')).toHaveLength(4)
  })

  it('covers every indicator type', () => {
    const types = new Set(
      Object.values(demoIndicators).flatMap((list) => list.map((i) => i.indicatorType)),
    )
    for (const type of [
      'OUTPUT',
      'OUTCOME',
      'ACTIVITY',
      'BUDGET',
      'TIMELINE',
      'PARTICIPATION',
      'SURVEY_SCORE',
    ])
      expect(types.has(type as never), type).toBe(true)
  })

  it('has expenses in every review state with reasons, receipts and signers', () => {
    const where = (fn: (e: (typeof demoExpenses)[number]) => boolean) => demoExpenses.filter(fn)
    expect(where((e) => e.flow === 'SUBMITTED' && e.receipt).length).toBeGreaterThanOrEqual(2)
    expect(where((e) => e.flow === 'SUBMITTED' && !e.receipt).length).toBeGreaterThanOrEqual(1)
    expect(where((e) => e.flow === 'VERIFIED').length).toBeGreaterThanOrEqual(2)
    expect(where((e) => e.flow === 'APPROVED').length).toBeGreaterThanOrEqual(2)
    expect(
      where((e) => e.flow === 'SIGNED_OFF' && e.signer === 'GRANT_MANAGER').length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      where((e) => e.flow === 'SIGNED_OFF' && e.signer === 'PROGRAM_MANAGER').length,
    ).toBeGreaterThanOrEqual(1)
    const rejected = where((e) => e.flow === 'REJECTED')
    expect(rejected.length).toBeGreaterThanOrEqual(2)
    expect(rejected.some((e) => e.rejectStage === 'VERIFY')).toBe(true)
    expect(rejected.some((e) => e.rejectStage === 'APPROVE')).toBe(true)
    for (const e of rejected) expect((e.reason ?? '').length).toBeGreaterThan(10)
    for (const e of demoExpenses) {
      expect(e.daysAgo).toBeLessThanOrEqual(300)
      if (e.activityKey)
        expect(
          demoActivities[e.project].some((a) => a.key === e.activityKey),
          e.description,
        ).toBe(true)
    }
    expect(demoExpenses.some((e) => e.daysAgo <= 4)).toBe(true)
  })

  it('hits the approved-spend utilization targets on the overview basis within two points', () => {
    // Overview basis: approved spend over the project envelope only (PROJECT_PROFILE_TOTAL).
    const planned = (key: ProjectKey) =>
      Number(demoProjects.find((p) => p.key === key)?.projectBudget) +
      (demoBudgets[key] ?? [])
        .filter((line) => line.category === 'PROJECT_PROFILE_TOTAL')
        .reduce((sum, line) => sum + Number(line.amount), 0)
    const approved = (key: ProjectKey, activityKey?: string) =>
      demoExpenses
        .filter((e) => e.project === key && ['APPROVED', 'SIGNED_OFF'].includes(e.flow))
        .filter((e) => !activityKey || e.activityKey === activityKey)
        .reduce((sum, e) => sum + Number(e.amount), 0)
    const targets: Array<[ProjectKey, number]> = [
      ['CRL', 92],
      ['SSG', 20],
      ['ALS', 80],
      ['WSH', 105],
      ['EHK', 96],
      ['ECD', 0],
    ]
    for (const [key, target] of targets)
      expect(Math.abs((approved(key) / planned(key)) * 100 - target), key).toBeLessThanOrEqual(2)
    for (const a of demoActivities.CRL) expect(a.budget).toBeUndefined()
    const activity = (key: string) => demoActivities.SSG.find((a) => a.key === key)
    const share = (key: string) => (approved('SSG', key) / Number(activity(key)?.budget)) * 100
    expect(Math.abs(share('orientation') - 95)).toBeLessThanOrEqual(2)
    expect(share('returnedproof')).toBeGreaterThan(100)
    expect(Number(activity('referral')?.budget)).toBe(0)
    expect(demoExpenses.some((e) => e.activityKey === 'referral')).toBe(true)
  })

  it('keeps the planned project in the future and the completed project inside its dates', () => {
    const project = (key: ProjectKey) =>
      demoProjects.find((p) => p.key === key) as (typeof demoProjects)[number]
    const ecd = project('ECD')
    expect(ecd.startOffset).toBeGreaterThan(0)
    expect(ecd.endOffset).toBeGreaterThan(ecd.startOffset)
    for (const a of demoActivities.ECD) {
      expect(a.outcome).toBe('NOT_STARTED')
      expect(a.startOffset).toBeGreaterThanOrEqual(ecd.startOffset)
    }
    expect(demoExpenses.some((e) => e.project === 'ECD')).toBe(false)
    expect(demoCohorts.ECD.count).toBe(0)
    const ehk = project('EHK')
    for (const a of demoActivities.EHK) expect(a.endOffset).toBeLessThanOrEqual(ehk.endOffset)
    for (const e of demoExpenses.filter((row) => row.project === 'EHK'))
      expect(-e.daysAgo).toBeLessThanOrEqual(ehk.endOffset)
    for (const m of demoMilestones.filter((row) => row.project === 'EHK'))
      expect(Math.max(m.targetOffset, m.completedOffset ?? m.targetOffset)).toBeLessThanOrEqual(
        ehk.endOffset,
      )
  })

  it('adds the budget, follow-up, survey and overdue rules', () => {
    const rule = (code: string) => demoRules.find((r) => r.code === code)
    const first = (code: string) => rule(code)?.conditions[0]
    expect(rule('BUDGET_NEAR_EXHAUSTED')).toMatchObject({ project: 'CRL', severity: 'HIGH' })
    expect(first('BUDGET_NEAR_EXHAUSTED')).toMatchObject({
      metric: 'BUDGET_UTILIZATION_PERCENT',
      operator: 'GTE',
      threshold: '90',
    })
    expect(rule('FOLLOW_UP_GAP')).toMatchObject({ project: 'CRL', severity: 'MEDIUM' })
    expect(first('FOLLOW_UP_GAP')).toMatchObject({
      metric: 'BENEFICIARY_FOLLOW_UP_PERCENT',
      operator: 'GTE',
      threshold: '25',
    })
    expect(rule('LOW_SURVEY_IMPROVEMENT')).toMatchObject({ project: 'WSH', severity: 'MEDIUM' })
    expect(first('LOW_SURVEY_IMPROVEMENT')).toMatchObject({
      metric: 'SURVEY_MEAN_IMPROVEMENT_POINTS',
      operator: 'LT',
      threshold: '20',
    })
    expect(rule('ACTIVITY_OVERDUE_ANY')).toMatchObject({ project: 'CRL', severity: 'MEDIUM' })
    expect(first('ACTIVITY_OVERDUE_ANY')).toMatchObject({
      metric: 'ACTIVITY_OVERDUE_COUNT',
      operator: 'GTE',
      threshold: '1',
    })
  })
})

describe('demo cohorts', () => {
  const start = '2026-03-01'
  const today = '2026-09-30'
  const everyone = demoProjects.flatMap((project) => planCohort(project, today, start))

  it('is deterministic', () => {
    for (const project of demoProjects)
      expect(planCohort(project, today, start)).toEqual(planCohort(project, today, start))
  })

  it('spans ages 6 to 68 with both sexes, every code unique and no future dates', () => {
    const ages = everyone.map((person) => person.age)
    expect(Math.min(...ages)).toBe(6)
    expect(Math.max(...ages)).toBe(68)
    expect(new Set(everyone.map((person) => person.sex))).toEqual(new Set(['MALE', 'FEMALE']))
    expect(new Set(everyone.map((person) => person.code)).size).toBe(everyone.length)
    for (const person of everyone) {
      expect(person.enrollmentDate <= today).toBe(true)
      expect(person.birthDate < person.enrollmentDate).toBe(true)
    }
  })

  it('leaves the Masbate pilot small enough for suppression to show', () => {
    expect(demoCohorts.ECD.count).toBeLessThan(10)
    const pilot = planCohort(
      demoProjects.find((p) => p.key === 'ECD') as (typeof demoProjects)[number],
      today,
      start,
    )
    const female = pilot.filter((person) => person.sex === 'FEMALE').length
    expect(female).toBeLessThan(5)
    expect(pilot.length - female).toBeLessThan(5)
  })

  it('keeps every EHK SADDD marginal at 5 or more so the closed release is not suppressed', () => {
    const ehk = demoProjects.find((p) => p.key === 'EHK') as (typeof demoProjects)[number]
    const projectStart = addDaysIso(today, ehk.startOffset)
    const projectEnd = addDaysIso(today, ehk.endOffset)
    const ageAtEnd = (born: string) => {
      const [by, bm, bd] = born.split('-').map(Number)
      const [ey, em, ed] = projectEnd.split('-').map(Number)
      return ey - by - (em < bm || (em === bm && ed < bd) ? 1 : 0)
    }
    const band = (age: number) =>
      age <= 9 ? '0-9' : age <= 14 ? '10-14' : age <= 17 ? '15-17' : age <= 24 ? '18-24' : '25+'
    const counts = new Map<string, number>()
    for (const person of planCohort(ehk, today, projectStart)) {
      expect(person.enrollmentDate <= projectEnd).toBe(true)
      for (const key of [person.sex, band(ageAtEnd(person.birthDate)), person.disability])
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const n of counts.values()) expect(n).toBeGreaterThanOrEqual(5)
  })

  it('gives every project that has started a cohort of at least 30', () => {
    for (const project of demoProjects.filter((p) => p.status !== 'PLANNED'))
      expect(demoCohorts[project.key].count, project.key).toBeGreaterThanOrEqual(30)
  })

  it('keeps people and household counts within the project cohort', () => {
    const peopleUnits = new Set(['girls', 'households', 'learners', 'families', 'caregivers'])
    for (const project of demoProjects.filter((p) => p.status !== 'PLANNED')) {
      const cohort = demoCohorts[project.key].count
      const within = (value: string | number, label: string) =>
        expect(Number(value), `${project.key} ${label}`).toBeLessThanOrEqual(cohort)
      const counted = demoIndicators[project.key].filter((i) => peopleUnits.has(i.unit))
      // Readings stay within the cohort; targets sit just above it, within the project target.
      for (const indicator of counted) {
        for (const value of indicator.readings) within(value, indicator.code)
        expect(Number(indicator.target), indicator.code).toBeLessThanOrEqual(
          project.targetBeneficiaries,
        )
      }
      for (const [key, code, value] of corrections)
        if (key === project.key && counted.some((i) => i.code === code)) within(value, code)
      for (const activity of demoActivities[project.key])
        within(activity.reached ?? 0, activity.key)
    }
    const crl = demoCohorts.CRL.count
    for (const value of [manualLibraryTarget, ...libraryReadings['LIB-HH-VISITED']])
      expect(Number(value)).toBeLessThanOrEqual(crl)
  })
})

describe('presentation import files map automatically', () => {
  const fields = registrationFields()
  const matchFields = asMatchFields(fields)

  function assertFullyAutoMapped(
    headers: string[],
    decisions: SmartMatchDecision[],
    targets: string[],
  ) {
    expect(decisions).toHaveLength(headers.length)
    decisions.forEach((decision, index) => {
      expect(decision.status, headers[index]).toBe('MAPPED')
      expect(decision.reason, headers[index]).toBe('AUTO_MATCH')
      expect(decision.matchReason, headers[index]).toBe('EXACT')
      expect(decision.targetFieldId, headers[index]).toBe(targets[index])
    })
    const mapped = decisions.map((decision) => decision.targetFieldId)
    expect(new Set(mapped).size).toBe(mapped.length)
  }

  const registrationTargets = [
    'registration_operation',
    'beneficiary_code',
    'subject_type',
    'first_name',
    'middle_name',
    'last_name',
    'sex',
    'birth_date',
    'disability_status',
    'location_barangay',
    'location_city_municipality',
    'location_province',
    'consent_recorded',
    'data_processing_consent_recorded',
    'is_minor',
    'guardian_consent_recorded',
    'enrollment_date',
  ]

  it('maps the registration CSV to the system registration form with no manual step', () => {
    const parsed = parseCsv(read('beneficiary-registration-borongan.csv'))
    expect(parsed.errors).toEqual([])
    expect(parsed.data).toHaveLength(25)
    assertFullyAutoMapped(
      parsed.headers,
      decide(parsed.headers, parsed.data, matchFields),
      registrationTargets,
    )
    // Every required field of the form has a column.
    const mapped = new Set(registrationTargets)
    for (const field of fields.filter((entry) => entry.required))
      expect(mapped.has(field.code)).toBe(true)
  })

  it('validates every registration row against the form, including the minimum age', () => {
    const parsed = parseCsv(read('beneficiary-registration-borongan.csv'))
    const decisions = decide(parsed.headers, parsed.data, matchFields)
    const codeByHeader = new Map(
      parsed.headers.map((header, index) => [header, decisions[index].targetFieldId as string]),
    )
    for (const row of parsed.data) {
      const raw: Record<string, unknown> = {}
      for (const [header, value] of Object.entries(row))
        raw[codeByHeader.get(header) as string] = value
      const result = normalizeImportedRow(fields, raw)
      expect(result.errors, String(raw.beneficiary_code)).toEqual([])
      expect(result.valid).toBe(true)
    }
    const codes = parsed.data.map((row) => row['Beneficiary code'])
    expect(new Set(codes).size).toBe(codes.length)
    const ages = parsed.data.map((row) => {
      const birth = new Date(`${row['Birth date']}T00:00:00Z`)
      const enrolled = new Date(`${row['Enrollment date']}T00:00:00Z`)
      let age = enrolled.getUTCFullYear() - birth.getUTCFullYear()
      if (
        enrolled.getUTCMonth() < birth.getUTCMonth() ||
        (enrolled.getUTCMonth() === birth.getUTCMonth() &&
          enrolled.getUTCDate() < birth.getUTCDate())
      )
        age -= 1
      return age
    })
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(5)
    expect(Math.max(...ages)).toBeLessThanOrEqual(70)
    // Minors carry guardian consent, adults do not need it.
    parsed.data.forEach((row, index) => {
      expect(row['Minor status']).toBe(String(ages[index] < 18))
      expect(row['Guardian consent']).toBe(row['Minor status'])
    })
  })

  it('carries the same registration data in the spreadsheet workbook', () => {
    const bytes = readFileSync(path.join(fixtures, 'beneficiary-registration-borongan.xlsx'))
    const workbook = parseWorkbook(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    const csv = parseCsv(read('beneficiary-registration-borongan.csv'))
    expect(workbook.headers).toEqual(csv.headers)
    expect(workbook.rows).toHaveLength(csv.data.length)
    assertFullyAutoMapped(
      workbook.headers,
      decide(workbook.headers, workbook.rows, matchFields),
      registrationTargets,
    )
    workbook.rows.forEach((row, index) => {
      for (const header of csv.headers) expect(String(row[header])).toBe(csv.data[index][header])
    })
  })

  it('maps the household follow-up file to the published Household Profile Update form', () => {
    const contracts: FormFieldValidationContract[] = householdProfileFields.map((field) => ({
      code: field.code,
      label: field.label,
      dataType: field.dataType,
      required: field.required,
      allowedValues: field.allowedValues ?? null,
      minimumValue: field.minimumValue ?? null,
      maximumValue: field.maximumValue ?? null,
      maximumLength: field.maximumLength ?? null,
    }))
    const parsed = parseCsv(read('household-profile-followup.csv'))
    expect(parsed.data.length).toBeGreaterThanOrEqual(10)
    const decisions = decide(parsed.headers, parsed.data, asMatchFields(contracts))
    assertFullyAutoMapped(
      parsed.headers,
      decisions,
      householdProfileFields.map((field) => field.code),
    )
    const codeByHeader = new Map(
      parsed.headers.map((header, index) => [header, decisions[index].targetFieldId as string]),
    )
    for (const row of parsed.data) {
      const raw: Record<string, unknown> = {}
      for (const [header, value] of Object.entries(row))
        raw[codeByHeader.get(header) as string] = value
      const result = normalizeImportedRow(contracts, raw)
      expect(result.errors, String(raw.beneficiary_code)).toEqual([])
    }
  })

  it('offers an import-then-extend structure whose shared columns match the household form exactly', () => {
    const parsed = parseCsv(read('livelihood-followup-structure.csv'))
    expect(parsed.data).toHaveLength(0)
    expect(parsed.headers.length).toBeGreaterThan(householdProfileFields.length - 4)
    expect(new Set(parsed.headers).size).toBe(parsed.headers.length)
    const contracts = asMatchFields(
      householdProfileFields.map((field) => ({
        code: field.code,
        label: field.label,
        dataType: field.dataType,
        required: field.required,
        allowedValues: field.allowedValues ?? null,
      })),
    )
    // Structure files have no rows: the shared columns still resolve by name, the new ones do not.
    const decisions = decide(parsed.headers, [], contracts)
    const byHeader = new Map(parsed.headers.map((header, index) => [header, decisions[index]]))
    for (const shared of [
      'Beneficiary code',
      'Visit date',
      'Main income source',
      'Monthly income range',
    ])
      expect(byHeader.get(shared)?.matchReason, shared).toBe('EXACT')
    for (const added of ['Livelihood activity', 'Savings group member', 'Access to credit'])
      expect(byHeader.get(added)?.status, added).toBe('PENDING')
  })
})

describe('attendance form contract', () => {
  it('matches the activity-monitoring field rules', () => {
    expect(attendanceFields.map((field) => field.code)).toEqual([
      'beneficiary_code',
      'participation_date',
      'attendance_status',
      'progress_status',
      'progress_notes',
    ])
  })
})

describe('local demo target guard', () => {
  const good = {
    DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
    DATABASE_URL: 'postgresql://pathways_runtime:x@127.0.0.1:54322/postgres',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    NODE_ENV: 'development',
  } as NodeJS.ProcessEnv

  it('accepts the loopback stack, with or without the rule machine roles', () => {
    expect(() => assertLocalDemoTarget(good)).not.toThrow()
    expect(() =>
      assertLocalDemoTarget({
        ...good,
        RULES_WORKER_DATABASE_URL: 'postgresql://pathways_rules_worker:x@127.0.0.1:54322/postgres',
        RULES_SWEEPER_DATABASE_URL:
          'postgresql://pathways_rules_sweeper:x@localhost:54322/postgres',
      }),
    ).not.toThrow()
  })

  it('refuses hosted, non-loopback, wrong-port and production targets', () => {
    const hosted = 'postgresql://prisma:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres'
    expect(() => assertLocalDemoTarget({ ...good, DIRECT_URL: hosted })).toThrow()
    expect(() => assertLocalDemoTarget({ ...good, DATABASE_URL: hosted })).toThrow()
    expect(() =>
      assertLocalDemoTarget({ ...good, SUPABASE_URL: 'https://klbtoqdalmcsfjqophty.supabase.co' }),
    ).toThrow()
    expect(() =>
      assertLocalDemoTarget({
        ...good,
        DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:5432/postgres',
      }),
    ).toThrow('local database port')
    expect(() => assertLocalDemoTarget({ ...good, RULES_WORKER_DATABASE_URL: hosted })).toThrow()
    expect(() => assertLocalDemoTarget({ ...good, NODE_ENV: 'production' })).toThrow('production')
    expect(() => assertLocalDemoTarget({})).toThrow()
  })
})
