import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import {
  beneficiaryRegistrationDefinitionErrors,
  hasAtomicPermission,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { contract, fieldSelection } from './beneficiaries.mapper'
import {
  type NormalizedValue,
  type RegistrationProfile,
  normalizeIdentifier,
  parseRegistration,
  stableValues,
} from './beneficiary-registration.helpers'

const registrationFormSelection = {
  id: true,
  version: true,
  status: true,
  formField_form: { select: fieldSelection, orderBy: { sequenceNo: 'asc' } },
} satisfies Prisma.DigitalFormSelect

export type RegistrationImportForm = Prisma.DigitalFormGetPayload<{
  select: typeof registrationFormSelection
}>

// Promotes a direct or imported registration inside the caller's transaction.
@Injectable()
export class BeneficiaryRegistrationService {
  /** Scoped registration definition read; imports may pin an archived version. */
  readRegistrationForm(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    formId: string,
    source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET',
  ) {
    return tx.digitalForm.findFirst({
      where: {
        id: formId,
        organizationId: actor.organizationId,
        projectId,
        formType: 'BENEFICIARY_REGISTRATION',
        status: source === 'DIRECT_ENTRY' ? 'PUBLISHED' : { in: ['PUBLISHED', 'ARCHIVED'] },
      },
      select: registrationFormSelection,
    })
  }

  async promoteRegistration(
    tx: Tx,
    actor: ApplicationIdentity,
    input: {
      projectId: string
      formId: string
      clientRegistrationId: string
      values: Record<string, unknown>
      source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET'
      validatedById: string
      importBatchId?: string
      importRowId?: string
    },
    preloaded?: { form: RegistrationImportForm },
  ): Promise<
    | { kind: 'PROCESSED'; beneficiaryId: string; enrollmentId: string; submissionId: string }
    | { kind: 'REVIEW'; code: string }
  > {
    // A chunked import shares one scoped form read across its rows. Direct entry
    // always reads and locks the published definition itself.
    const form =
      input.source === 'IMPORTED_DATASET' && preloaded?.form.id === input.formId
        ? preloaded.form
        : await this.readRegistrationForm(tx, actor, input.projectId, input.formId, input.source)
    if (!form) throw new NotFoundException('Published registration form unavailable.')
    if (input.source === 'DIRECT_ENTRY') {
      const [definitionLock] = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pathways.p29_lock_registration_definition(
          ${actor.organizationId}::uuid, ${input.projectId}::uuid,
          ${form.id}::uuid, ${form.version}::integer
        ) AS locked
      `
      if (typeof definitionLock?.locked !== 'boolean') {
        throw new Error('Registration definition lock is unavailable.')
      }
      if (!definitionLock.locked) {
        throw new NotFoundException('Published registration form unavailable.')
      }
    }
    const formContract = form.formField_form.map(contract)
    const definitionErrors = beneficiaryRegistrationDefinitionErrors(formContract)
    if (definitionErrors.length > 0) {
      throw new ConflictException({
        message: 'Registration form does not implement the required domain field contract.',
        errors: definitionErrors,
      })
    }
    const validation = validateAndNormalizeFormData(formContract, input.values, 'final')
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Registration values are invalid.',
        errors: validation.errors,
      })
    }
    const values = validation.values as Record<string, NormalizedValue>
    // An imported row without recorded consent waits for a person; direct entry still rejects it.
    if (input.source === 'IMPORTED_DATASET') {
      if (values.consent_recorded !== true || values.data_processing_consent_recorded !== true) {
        return { kind: 'REVIEW', code: 'CONSENT_REQUIRED' }
      }
      if (values.is_minor === true && values.guardian_consent_recorded !== true) {
        return { kind: 'REVIEW', code: 'GUARDIAN_CONSENT_REQUIRED' }
      }
    }
    const registration = parseRegistration(values)
    const mayReviewIdentity = hasAtomicPermission(
      actor.roles[0],
      actor.permissions,
      'beneficiaries.identities.review',
    )
    if (registration.operation !== 'CREATE' && !mayReviewIdentity) {
      throw new ForbiddenException('Beneficiary identity review permission is missing.')
    }

    const existingSubmission = await tx.formSubmission.findFirst({
      where:
        input.source === 'IMPORTED_DATASET' && input.importRowId
          ? { organizationId: actor.organizationId, importRowId: input.importRowId }
          : {
              organizationId: actor.organizationId,
              submittedById: actor.userId,
              clientSubmissionId: input.clientRegistrationId,
            },
      include: {
        formResponseValue_submission: {
          include: { field: { select: { code: true } } },
        },
        enrollment: { select: { beneficiaryId: true, id: true } },
      },
    })
    if (existingSubmission) {
      const expectedSubmissionSource =
        input.source === 'DIRECT_ENTRY' ? 'DIRECT_ENCODING' : 'IMPORTED_DATASET'
      const stored = Object.fromEntries(
        existingSubmission.formResponseValue_submission.map((response) => [
          response.field.code,
          response.value as NormalizedValue,
        ]),
      )
      if (
        existingSubmission.projectId !== input.projectId ||
        existingSubmission.formId !== form.id ||
        existingSubmission.formVersion !== form.version ||
        existingSubmission.source !== expectedSubmissionSource ||
        !existingSubmission.enrollment ||
        stableValues(stored) !== stableValues(values)
      ) {
        throw new ConflictException('The registration id was already used for different input.')
      }
      return {
        kind: 'PROCESSED',
        beneficiaryId: existingSubmission.enrollment.beneficiaryId,
        enrollmentId: existingSubmission.enrollment.id,
        submissionId: existingSubmission.id,
      }
    }

    const candidates = new Set<string>()
    const byCode = await tx.beneficiary.findUnique({
      where: {
        organizationId_code: { organizationId: actor.organizationId, code: registration.code },
      },
      select: { id: true },
    })
    if (byCode) candidates.add(byCode.id)
    if (registration.externalIdentifier) {
      const byIdentifier = await tx.beneficiaryIdentifier.findUnique({
        where: {
          organizationId_identifierType_normalizedValue: {
            organizationId: actor.organizationId,
            identifierType: registration.externalIdentifier.type,
            normalizedValue: normalizeIdentifier(registration.externalIdentifier.value),
          },
        },
        select: { beneficiaryId: true },
      })
      if (byIdentifier) candidates.add(byIdentifier.beneficiaryId)
    }
    if (candidates.size > 1) {
      return {
        kind: 'REVIEW',
        code: mayReviewIdentity ? 'AMBIGUOUS_IDENTITY' : 'IDENTITY_REVIEW_REQUIRED',
      }
    }
    const candidateId = [...candidates][0]
    if (registration.operation === 'CREATE' && candidateId) {
      return {
        kind: 'REVIEW',
        code: mayReviewIdentity ? 'DUPLICATE_IDENTITY' : 'IDENTITY_REVIEW_REQUIRED',
      }
    }
    if (registration.operation !== 'CREATE' && !candidateId) {
      return { kind: 'REVIEW', code: 'UNKNOWN_IDENTITY' }
    }

    if (candidateId) {
      const candidate = await tx.beneficiary.findFirst({
        where: { id: candidateId, organizationId: actor.organizationId, archivedAt: null },
        select: { code: true, subjectType: true },
      })
      if (!candidate || candidate.code !== registration.code) {
        return { kind: 'REVIEW', code: 'IDENTIFIER_CODE_CONFLICT' }
      }
      if (candidate.subjectType !== registration.subjectType) {
        return { kind: 'REVIEW', code: 'SUBJECT_TYPE_CONFLICT' }
      }
    }

    let beneficiaryId = candidateId
    if (!beneficiaryId) {
      if (
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.register')
      ) {
        throw new ForbiddenException('Beneficiary registration permission is missing.')
      }
      const createdId = randomUUID()
      // The profile is readable only after enrollment; INSERT RETURNING would require SELECT now.
      const created = await tx.beneficiary.createMany({
        data: {
          id: createdId,
          organizationId: actor.organizationId,
          code: registration.code,
          subjectType: registration.subjectType,
          displayName: registration.displayName,
          firstName: registration.firstName,
          middleName: registration.middleName,
          lastName: registration.lastName,
          sex: registration.sex,
          birthDate: registration.birthDate,
          ageAtRegistration: registration.ageAtRegistration,
          disabilityStatus: registration.disabilityStatus,
          locationBarangay: registration.locationBarangay,
          locationCityMunicipality: registration.locationCityMunicipality,
          locationProvince: registration.locationProvince,
          consentRecorded: true,
          dataProcessingConsentRecorded: true,
          isMinor: registration.isMinor,
          guardianConsentRecorded: registration.guardianConsentRecorded,
          createdById: actor.userId,
        },
      })
      if (created.count !== 1)
        throw new ConflictException('Beneficiary registration was not created.')
      beneficiaryId = createdId
    } else if (registration.operation === 'UPDATE') {
      if (
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.profiles.update')
      ) {
        throw new ForbiddenException('Beneficiary profile update permission is missing.')
      }
      const inaccessibleEnrollment = await tx.beneficiaryProjectEnrollment.findFirst({
        where: {
          organizationId: actor.organizationId,
          beneficiaryId,
          status: 'ACTIVE',
          projectId: { notIn: actor.assignedProjectIds },
        },
        select: { id: true },
      })
      if (actor.roles[0] !== 'SYSTEM_ADMINISTRATOR') {
        if (inaccessibleEnrollment)
          return { kind: 'REVIEW', code: 'SHARED_PROFILE_UPDATE_REVIEW_REQUIRED' }
      }
      const updateData = this.registrationUpdateData(registration)
      await tx.beneficiary.updateMany({
        where: { id: beneficiaryId, organizationId: actor.organizationId, archivedAt: null },
        data: updateData,
      })
    }

    if (!beneficiaryId) throw new ConflictException('Registration identity could not be resolved.')
    let enrollment = await tx.beneficiaryProjectEnrollment.findUnique({
      where: {
        organizationId_projectId_beneficiaryId: {
          organizationId: actor.organizationId,
          projectId: input.projectId,
          beneficiaryId,
        },
      },
      select: { id: true },
    })
    if (!enrollment) {
      const mayEnroll =
        registration.operation === 'CREATE' ||
        hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.enrollments.manage')
      if (!mayEnroll) throw new ForbiddenException('Beneficiary enrollment permission is missing.')
      enrollment = await tx.beneficiaryProjectEnrollment.create({
        data: {
          organizationId: actor.organizationId,
          projectId: input.projectId,
          beneficiaryId,
          enrollmentDate: registration.enrollmentDate,
          recordedById: actor.userId,
        },
        select: { id: true },
      })
    }
    if (registration.externalIdentifier) {
      const key = {
        organizationId: actor.organizationId,
        identifierType: registration.externalIdentifier.type,
        normalizedValue: normalizeIdentifier(registration.externalIdentifier.value),
      }
      const storedIdentifier = await tx.beneficiaryIdentifier.findUnique({
        where: { organizationId_identifierType_normalizedValue: key },
        select: { beneficiaryId: true },
      })
      if (storedIdentifier && storedIdentifier.beneficiaryId !== beneficiaryId) {
        throw new ConflictException('The stable identifier belongs to another beneficiary.')
      }
      if (!storedIdentifier) {
        await tx.beneficiaryIdentifier.create({
          data: {
            ...key,
            beneficiaryId,
            displayValue: registration.externalIdentifier.value,
            source: input.source,
            createdById: actor.userId,
          },
        })
      }
    }
    const [databaseClock] =
      input.source === 'DIRECT_ENTRY'
        ? await tx.$queryRaw<Array<{ transactionTime: Date }>>`
          SELECT date_trunc('milliseconds', CURRENT_TIMESTAMP) AS "transactionTime"
        `
        : await tx.$queryRaw<Array<{ transactionTime: Date }>>`
          SELECT CURRENT_TIMESTAMP AS "transactionTime"
        `
    if (!(databaseClock?.transactionTime instanceof Date)) {
      throw new Error('Database transaction time is unavailable.')
    }
    const submittedAt = databaseClock.transactionTime
    const submission = await tx.formSubmission.create({
      data: {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        formId: form.id,
        formVersion: form.version,
        clientSubmissionId: input.clientRegistrationId,
        importBatchId: input.importBatchId,
        importRowId: input.importRowId,
        enrollmentId: enrollment.id,
        submittedById: actor.userId,
        source: input.source === 'DIRECT_ENTRY' ? 'DIRECT_ENCODING' : 'IMPORTED_DATASET',
        status: 'DRAFT',
      },
      select: { id: true },
    })
    await tx.formResponseValue.createMany({
      data: form.formField_form.map((field) => ({
        organizationId: actor.organizationId,
        projectId: input.projectId,
        formId: form.id,
        submissionId: submission.id,
        fieldId: field.id,
        value:
          values[field.code] === null
            ? Prisma.JsonNull
            : (values[field.code] as Prisma.InputJsonValue),
      })),
    })
    await tx.formSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'VALIDATED',
        submittedAt,
        validatedAt: submittedAt,
        validatedById: input.validatedById,
      },
    })
    const consentKinds: Array<'PARTICIPATION' | 'DATA_PROCESSING' | 'GUARDIAN'> = [
      'PARTICIPATION',
      'DATA_PROCESSING',
    ]
    if (registration.guardianConsentRecorded) consentKinds.push('GUARDIAN')
    await tx.beneficiaryConsentRecord.createMany({
      data: consentKinds.map((kind) => ({
        organizationId: actor.organizationId,
        projectId: input.projectId,
        beneficiaryId,
        enrollmentId: enrollment.id,
        submissionId: submission.id,
        kind,
        source: input.source,
        recordedById: actor.userId,
        recordedAt: submittedAt,
      })),
    })
    await writeAuditLog(tx, actor, {
      projectId: input.projectId,
      action: 'BENEFICIARY_REGISTRATION_PROMOTED',
      entityType: 'Beneficiary',
      entityId: beneficiaryId,
      changes: {
        operation: registration.operation,
        source: input.source,
        enrollmentId: enrollment.id,
        submissionId: submission.id,
        consentKinds,
        profileFieldsChanged: registration.operation === 'UPDATE' ? registration.updateFields : [],
      },
    })
    return {
      kind: 'PROCESSED',
      beneficiaryId,
      enrollmentId: enrollment.id,
      submissionId: submission.id,
    }
  }

  private registrationUpdateData(
    registration: RegistrationProfile,
  ): Prisma.BeneficiaryUpdateManyMutationInput {
    const source: Record<string, unknown> = {
      display_name: registration.displayName,
      first_name: registration.firstName,
      middle_name: registration.middleName,
      last_name: registration.lastName,
      sex: registration.sex,
      birth_date: registration.birthDate,
      age_at_registration: registration.ageAtRegistration,
      disability_status: registration.disabilityStatus,
      location_barangay: registration.locationBarangay,
      location_city_municipality: registration.locationCityMunicipality,
      location_province: registration.locationProvince,
    }
    const prismaNames: Record<string, string> = {
      display_name: 'displayName',
      first_name: 'firstName',
      middle_name: 'middleName',
      last_name: 'lastName',
      birth_date: 'birthDate',
      age_at_registration: 'ageAtRegistration',
      disability_status: 'disabilityStatus',
      location_barangay: 'locationBarangay',
      location_city_municipality: 'locationCityMunicipality',
      location_province: 'locationProvince',
    }
    return Object.fromEntries(
      registration.updateFields.map((field) => [prismaNames[field] ?? field, source[field]]),
    ) as Prisma.BeneficiaryUpdateManyMutationInput
  }
}
