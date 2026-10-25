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
const unmatchedCodes = new Set(['beneficiary_code', 'registration_operation'])
const identityCodes = new Set(['first_name', 'last_name', 'birth_date'])

/** The hash a rejected file value is remembered by; a missing value hashes as null. */
export function valueHash(value: unknown) {
  return checksum(stableJson(value ?? null))
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

  const latest = await tx.formSubmission.findFirst({
    where: {
      organizationId: actor.organizationId,
      status: 'VALIDATED',
      form: { formType: 'BENEFICIARY_REGISTRATION' },
      enrollment: { beneficiaryId },
    },
    orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      formResponseValue_submission: { select: { value: true, field: { select: { code: true } } } },
    },
  })
  const stored = new Map(
    (latest?.formResponseValue_submission ?? []).map((item) => [item.field.code, item.value]),
  )
  let differing = form.formField_form.filter((field) => {
    const kind = (field.rule as { kind?: string } | null)?.kind
    return (
      field.code in values &&
      !unmatchedCodes.has(field.code) &&
      !(kind && computedRuleKinds.has(kind)) &&
      stableJson(values[field.code] ?? null) !== stableJson(stored.get(field.code) ?? null)
    )
  })
  if (differing.length > 0) {
    const rejected = await tx.importValueRejection.findMany({
      where: {
        organizationId: actor.organizationId,
        beneficiaryId,
        fieldId: { in: differing.map((field) => field.id) },
        valueHash: { in: differing.map((field) => valueHash(values[field.code])) },
      },
      select: { fieldId: true, valueHash: true },
    })
    // A rejected file value is forgiven only on the field and participant it was rejected for.
    differing = differing.filter(
      (field) =>
        !rejected.some(
          (item) => item.fieldId === field.id && item.valueHash === valueHash(values[field.code]),
        ),
    )
  }
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

  const enrollment = await tx.beneficiaryProjectEnrollment.findUnique({
    where: {
      organizationId_projectId_beneficiaryId: {
        organizationId: actor.organizationId,
        projectId: form.projectId,
        beneficiaryId,
      },
    },
    select: { id: true },
  })
  return { kind: 'SAME', beneficiaryId, enrolledHere: enrollment !== null }
}
