import { describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import type { RegistrationImportForm } from '../beneficiaries/beneficiary-registration.service'
import { matchParticipant, valueHash } from './participant-match'

type Values = Parameters<typeof matchParticipant>[2]['values']

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '30000000-0000-4000-8000-000000000003'
const beneficiaryId = '50000000-0000-4000-8000-000000000005'
const actor = { organizationId } as ApplicationIdentity

const field = (code: string, rule: unknown = null) => ({ id: `${code}-id`, code, rule })

const form = {
  id: '40000000-0000-4000-8000-000000000004',
  projectId,
  version: 1,
  status: 'PUBLISHED',
  formField_form: [
    field('registration_operation'),
    field('beneficiary_code'),
    field('external_identifier_type'),
    field('external_identifier_value'),
    field('first_name'),
    field('last_name'),
    field('birth_date'),
    field('civil_status'),
    field('age_stated', { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: [] }),
    field('age_at_registration', { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'x' }),
    field('is_minor', { kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'x' }),
  ],
} as unknown as RegistrationImportForm

const file = {
  registration_operation: 'CREATE',
  beneficiary_code: 'PART-FILE-1',
  external_identifier_type: 'STUDENT_ID',
  external_identifier_value: ' 2024-001 ',
  first_name: 'Ana',
  last_name: 'Cruz',
  birth_date: '2008-08-17',
  civil_status: 'Single',
  age_stated: 17,
  age_at_registration: 17,
  is_minor: true,
}

const stored = { ...file, beneficiary_code: 'PW0000000001', registration_operation: 'LINK' }

function fakeTx(options: {
  known?: boolean
  submission?: Record<string, unknown> | null
  enrolled?: boolean
  rejected?: Array<{ fieldId: string; valueHash: string }>
}) {
  const { known = true, submission = stored, enrolled = true, rejected = [] } = options
  return {
    beneficiaryIdentifier: {
      findUnique: vi.fn(async () => (known ? { beneficiaryId } : null)),
    },
    formSubmission: {
      findFirst: vi.fn(async () =>
        submission
          ? {
              formResponseValue_submission: Object.entries(submission).map(([code, value]) => ({
                field: { code },
                value,
              })),
            }
          : null,
      ),
    },
    beneficiaryProjectEnrollment: {
      findUnique: vi.fn(async () => (enrolled ? { id: 'enrollment' } : null)),
    },
    importValueRejection: { findMany: vi.fn(async () => rejected) },
  }
}

const match = (tx: ReturnType<typeof fakeTx>, values: Record<string, unknown> = file) =>
  matchParticipant(tx as unknown as Tx, actor, {
    form,
    values: values as Values,
  })

describe('matchParticipant', () => {
  it('unknown id is NEW', async () => {
    expect(await match(fakeTx({ known: false }))).toEqual({ kind: 'NEW' })
  })

  it('blank id held IDENTITY_MISSING', async () => {
    const tx = fakeTx({})
    expect(await match(tx, { ...file, external_identifier_value: '  ' })).toEqual({
      kind: 'HOLD',
      code: 'IDENTITY_MISSING',
    })
    expect(await match(tx, { ...file, external_identifier_value: null })).toEqual({
      kind: 'HOLD',
      code: 'IDENTITY_MISSING',
    })
    expect(tx.beneficiaryIdentifier.findUnique).not.toHaveBeenCalled()
  })

  it('looks the id up by normalized value inside the actor organization', async () => {
    const tx = fakeTx({})
    await match(tx, { ...file, external_identifier_value: ' 2024-001 ' })
    expect(tx.beneficiaryIdentifier.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_identifierType_normalizedValue: {
          organizationId,
          identifierType: 'STUDENT_ID',
          normalizedValue: '2024-001',
        },
      },
      select: { beneficiaryId: true },
    })
  })

  it('same values SAME, enrolled here or not', async () => {
    expect(await match(fakeTx({ enrolled: true }))).toEqual({
      kind: 'SAME',
      beneficiaryId,
      enrolledHere: true,
    })
    expect(await match(fakeTx({ enrolled: false }))).toEqual({
      kind: 'SAME',
      beneficiaryId,
      enrolledHere: false,
    })
  })

  it('age column drift ignored', async () => {
    const drifted = { ...file, age_stated: 18, age_at_registration: 18, is_minor: false }
    expect(await match(fakeTx({}), drifted)).toMatchObject({ kind: 'SAME' })
  })

  it('changed civil status PROFILE_CHANGED', async () => {
    expect(await match(fakeTx({}), { ...file, civil_status: 'Married' })).toEqual({
      kind: 'CHANGED',
      beneficiaryId,
      code: 'PROFILE_CHANGED',
      fieldCodes: ['civil_status'],
    })
  })

  it('changed birth date IDENTITY_CONFLICT', async () => {
    expect(
      await match(fakeTx({}), { ...file, birth_date: '2008-09-17', civil_status: 'Married' }),
    ).toEqual({
      kind: 'CHANGED',
      beneficiaryId,
      code: 'IDENTITY_CONFLICT',
      fieldCodes: ['birth_date', 'civil_status'],
    })
  })

  it('changed name IDENTITY_CONFLICT', async () => {
    expect(await match(fakeTx({}), { ...file, last_name: 'Reyes' })).toMatchObject({
      code: 'IDENTITY_CONFLICT',
      fieldCodes: ['last_name'],
    })
  })

  it('rejected file value not raised again', async () => {
    const changed = { ...file, civil_status: 'Married' }
    const rejected = [{ fieldId: 'civil_status-id', valueHash: valueHash('Married') }]
    const tx = fakeTx({ rejected })
    expect(await match(tx, changed)).toMatchObject({ kind: 'SAME' })
    expect(tx.importValueRejection.findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        beneficiaryId,
        fieldId: { in: ['civil_status-id'] },
        valueHash: { in: [valueHash('Married')] },
      },
      select: { fieldId: true, valueHash: true },
    })
    // A different value for the same field is held again.
    expect(await match(fakeTx({ rejected }), { ...file, civil_status: 'Widowed' })).toMatchObject({
      kind: 'CHANGED',
      code: 'PROFILE_CHANGED',
    })
  })

  it('a known id with no stored registration is held, never treated as the same', async () => {
    expect(await match(fakeTx({ submission: null }))).toMatchObject({ kind: 'CHANGED' })
  })
})

describe('valueHash', () => {
  it('is a stable sha256 hex of the value', () => {
    expect(valueHash({ b: 1, a: 2 })).toBe(valueHash({ a: 2, b: 1 }))
    expect(valueHash('x')).toMatch(/^[0-9a-f]{64}$/)
    expect(valueHash('x')).not.toBe(valueHash('y'))
  })
})
