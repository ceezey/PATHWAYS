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

import {
  attendanceFields,
  demoActivities,
  demoCohorts,
  demoIndicators,
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
        if (activity.outcome === 'OVERDUE_EXPLAINED')
          expect((activity.explanation ?? '').length).toBeGreaterThanOrEqual(10)
        if (activity.outcome === 'CANCELLED') expect(activity.reason).toBeTruthy()
        if (
          ['COMPLETED', 'PENDING_REVIEW', 'RETURNED', 'PROGRESS_VERIFIED'].includes(
            activity.outcome,
          )
        )
          expect(activity.note).toBeTruthy()
      }
  })

  it('keeps every indicator reading inside its numeric domain, with several readings each', () => {
    for (const list of Object.values(demoIndicators))
      for (const indicator of list) {
        expect(indicator.readings.length).toBeGreaterThanOrEqual(2)
        for (const value of [indicator.baseline, indicator.target, ...indicator.readings]) {
          expect(Number.isFinite(Number(value))).toBe(true)
          if (indicator.numericKind === 'PERCENTAGE') expect(Number(value)).toBeLessThanOrEqual(100)
        }
      }
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

describe('demo cohorts', () => {
  const start = '2026-03-01'
  const today = '2026-09-30'
  const everyone = demoProjects.flatMap((project) => planCohort(project, today, start))

  it('is deterministic', () => {
    for (const project of demoProjects)
      expect(planCohort(project, today, start)).toEqual(planCohort(project, today, start))
  })

  it('spans ages 5 to 70 with both sexes, every code unique and no future dates', () => {
    const ages = everyone.map((person) => person.age)
    expect(Math.min(...ages)).toBe(5)
    expect(Math.max(...ages)).toBe(70)
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
