import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import {
  type NormalizedValue,
  canonicalIdentifierType,
  normalizeIdentifier,
} from '../beneficiaries/beneficiary-registration.helpers'
import type { RegistrationImportForm } from '../beneficiaries/beneficiary-registration.service'
import { checksum, stableJson } from './imports.helpers'

export type ParticipantMatch =
  | { kind: 'NEW' }
  | { kind: 'SAME'; beneficiaryId: string; enrolledHere: boolean }
  | {
      kind: 'CHANGED'
      beneficiaryId: string
      code: 'PROFILE_CHANGED' | 'IDENTITY_CONFLICT'
      fieldCodes: string[]
    }
  | { kind: 'HOLD'; code: 'IDENTITY_MISSING' }

// Computed columns recalculate on every export, so they never count as a change.
const computedRuleKinds = new Set(['AGE_CHECK', 'AGE_AT_DATE', 'MINOR_AT_DATE'])
// The identifier and its type are equal by construction once a participant is found by them.
const unmatchedCodes = new Set([
  'beneficiary_code',
  'registration_operation',
  'external_identifier_type',
  'external_identifier_value',
])
const identityCodes = new Set(['first_name', 'last_name', 'birth_date'])

/** The hash a rejected file value is remembered by; a missing value hashes as null. */
export function valueHash(value: unknown) {
  return checksum(stableJson(value ?? null))
}

export interface Baseline {
  enrolledHere: boolean
  stored: Map<string, unknown>
}

/**
 * What PATHWAYS holds for a participant, or null when it cannot be read.
 * Enrolled here: this project's latest registration is the baseline, for every field.
 * Elsewhere only: submissions of other projects are not readable, so the profile's identity decides.
 */
export async function readBaseline(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  beneficiaryId: string,
): Promise<Baseline | null> {
  const enrollment = await tx.beneficiaryProjectEnrollment.findUnique({
    where: {
      organizationId_projectId_beneficiaryId: {
        organizationId: actor.organizationId,
        projectId,
        beneficiaryId,
      },
    },
    select: { id: true },
  })
  const enrolledHere = enrollment !== null
  const stored = new Map<string, unknown>()
  if (enrolledHere) {
    const latest = await tx.formSubmission.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId,
        status: 'VALIDATED',
        form: { formType: 'BENEFICIARY_REGISTRATION' },
        enrollment: { beneficiaryId },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        formResponseValue_submission: {
          select: { value: true, field: { select: { code: true } } },
        },
      },
    })
    if (!latest) return null
    for (const item of latest.formResponseValue_submission) stored.set(item.field.code, item.value)
  } else {
    const profile = await tx.beneficiary.findFirst({
      where: { id: beneficiaryId, organizationId: actor.organizationId, archivedAt: null },
      select: { firstName: true, lastName: true, birthDate: true },
    })
    if (!profile) return null
    stored.set('first_name', profile.firstName)
    stored.set('last_name', profile.lastName)
    stored.set('birth_date', profile.birthDate?.toISOString().slice(0, 10) ?? null)
  }
  return { enrolledHere, stored }
}

/** The form fields whose file value differs from the baseline, computed columns aside. */
export function differingFields(
  form: RegistrationImportForm,
  values: Record<string, NormalizedValue>,
  baseline: Baseline,
) {
  return form.formField_form.filter((field) => {
    const kind = (field.rule as { kind?: string } | null)?.kind
    return (
      field.code in values &&
      (baseline.enrolledHere || identityCodes.has(field.code)) &&
      !unmatchedCodes.has(field.code) &&
      !(kind && computedRuleKinds.has(kind)) &&
      stableJson(values[field.code] ?? null) !== stableJson(baseline.stored.get(field.code) ?? null)
    )
  })
}

type FormField = RegistrationImportForm['formField_form'][number]

// Splits the differing fields into those still to be decided and those whose file value the reviewer rejected before.
async function splitRejected(
  tx: Tx,
  actor: ApplicationIdentity,
  beneficiaryId: string,
  differing: FormField[],
  values: Record<string, NormalizedValue>,
) {
  if (differing.length === 0) return { kept: differing, rejected: differing }
  const remembered = await tx.importValueRejection.findMany({
    where: {
      organizationId: actor.organizationId,
      beneficiaryId,
      fieldId: { in: differing.map((field) => field.id) },
      valueHash: { in: differing.map((field) => valueHash(values[field.code])) },
    },
    select: { fieldId: true, valueHash: true },
  })
  // A rejected file value is forgiven only on the field and participant it was rejected for.
  const isRejected = (field: FormField) =>
    remembered.some(
      (item) => item.fieldId === field.id && item.valueHash === valueHash(values[field.code]),
    )
  return {
    kept: differing.filter((field) => !isRejected(field)),
    rejected: differing.filter(isRejected),
  }
}

/** The PATHWAYS value of each field whose file value was rejected before, which such a field keeps. */
export async function rejectedBaseline(
  tx: Tx,
  actor: ApplicationIdentity,
  form: RegistrationImportForm,
  values: Record<string, NormalizedValue>,
  beneficiaryId: string,
  known?: Baseline | null,
) {
  const baseline = known ?? (await readBaseline(tx, actor, form.projectId, beneficiaryId))
  if (!baseline) return {}
  const { rejected } = await splitRejected(
    tx,
    actor,
    beneficiaryId,
    differingFields(form, values, baseline),
    values,
  )
  return Object.fromEntries(
    rejected.map((field) => [field.code, baseline.stored.get(field.code) ?? null]),
  )
}

/** Matches an imported registration row to a participant by the client's Student ID, never by code. */
export async function matchParticipant(
  tx: Tx,
  actor: ApplicationIdentity,
  input: { form: RegistrationImportForm; values: Record<string, NormalizedValue> },
): Promise<ParticipantMatch> {
  const { form, values } = input
  const identifier = values.external_identifier_value
  const identifierType = canonicalIdentifierType(values.external_identifier_type)
  const normalizedValue = typeof identifier === 'string' ? normalizeIdentifier(identifier) : ''
  if (!normalizedValue || !identifierType) return { kind: 'HOLD', code: 'IDENTITY_MISSING' }

  const known = await tx.beneficiaryIdentifier.findUnique({
    where: {
      organizationId_identifierType_normalizedValue: {
        organizationId: actor.organizationId,
        identifierType,
        normalizedValue,
      },
    },
    select: { beneficiaryId: true },
  })
  if (!known) return { kind: 'NEW' }
  const { beneficiaryId } = known

  const baseline = await readBaseline(tx, actor, form.projectId, beneficiaryId)
  if (!baseline) {
    return { kind: 'CHANGED', beneficiaryId, code: 'IDENTITY_CONFLICT', fieldCodes: [] }
  }
  const { kept: differing } = await splitRejected(
    tx,
    actor,
    beneficiaryId,
    differingFields(form, values, baseline),
    values,
  )
  if (differing.length > 0) {
    const fieldCodes = differing.map((field) => field.code)
    return {
      kind: 'CHANGED',
      beneficiaryId,
      code: fieldCodes.some((code) => identityCodes.has(code))
        ? 'IDENTITY_CONFLICT'
        : 'PROFILE_CHANGED',
      fieldCodes,
    }
  }

  return { kind: 'SAME', beneficiaryId, enrolledHere: baseline.enrolledHere }
}
