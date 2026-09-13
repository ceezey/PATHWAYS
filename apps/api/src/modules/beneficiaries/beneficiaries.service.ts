import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { hasAtomicPermission } from '@app/modules/auth/authorization-policy'
import { projectScope } from '@app/modules/auth/authorized-data.service'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '@app/modules/auth/developer-access'
import { PrismaService } from '@app/prisma/prisma.service'
import { type FormFieldValidationContract, validateAndNormalizeFormData } from '@pathways/shared'
import {
  type ArchiveBeneficiaryDto,
  type BeneficiaryListQueryDto,
  type EnrollBeneficiaryDto,
  type RegisterBeneficiaryDto,
  type UpdateBeneficiaryDto,
  canonicalCode,
  canonicalIdentifierType,
  canonicalIdentifierValue,
} from './beneficiaries.dto'

type Tx = Prisma.TransactionClient
type NormalizedValue = string | number | boolean | string[] | null

const fieldSelection = {
  id: true,
  code: true,
  label: true,
  dataType: true,
  isRequired: true,
  allowedValues: true,
  minimumValue: true,
  maximumValue: true,
  minimumDate: true,
  maximumDate: true,
  minimumLength: true,
  maximumLength: true,
  sequenceNo: true,
} satisfies Prisma.FormFieldSelect

type FieldRow = Prisma.FormFieldGetPayload<{ select: typeof fieldSelection }>

const requiredRegistrationFields = [
  'registration_operation',
  'beneficiary_code',
  'subject_type',
  'consent_recorded',
  'data_processing_consent_recorded',
  'enrollment_date',
] as const

const writableProfileFields = new Set([
  'display_name',
  'first_name',
  'middle_name',
  'last_name',
  'sex',
  'birth_date',
  'age_at_registration',
  'disability_status',
  'location_barangay',
  'location_city_municipality',
  'location_province',
])

function jsonStrings(value: Prisma.JsonValue | null) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

function contract(field: FieldRow): FormFieldValidationContract {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    allowedValues: jsonStrings(field.allowedValues),
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
  }
}

function exactDate(value: NormalizedValue | undefined, field: string) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${field} must be a calendar date in YYYY-MM-DD format.`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} is not a real calendar date.`)
  }
  return date
}

function text(value: NormalizedValue | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function enumValue<T extends string>(
  value: NormalizedValue | undefined,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(`${field} is invalid.`)
  }
  return value as T
}

function yearsAt(birthDate: Date, reference: Date) {
  let years = reference.getUTCFullYear() - birthDate.getUTCFullYear()
  const beforeBirthday =
    reference.getUTCMonth() < birthDate.getUTCMonth() ||
    (reference.getUTCMonth() === birthDate.getUTCMonth() &&
      reference.getUTCDate() < birthDate.getUTCDate())
  if (beforeBirthday) years -= 1
  return years
}

function stableValues(value: Record<string, NormalizedValue>) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  )
}

function normalizeIdentifier(value: string) {
  return value.normalize('NFKC').trim()
}

type RegistrationProfile = {
  operation: 'CREATE' | 'LINK' | 'UPDATE'
  code: string
  subjectType: 'INDIVIDUAL' | 'GROUP' | 'COMMUNITY'
  displayName: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  sex: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | 'NOT_SPECIFIED'
  birthDate: Date | null
  ageAtRegistration: number | null
  disabilityStatus: 'WITH_DISABILITY' | 'WITHOUT_DISABILITY' | 'NOT_SPECIFIED'
  locationBarangay: string | null
  locationCityMunicipality: string | null
  locationProvince: string | null
  consentRecorded: true
  dataProcessingConsentRecorded: true
  isMinor: boolean
  guardianConsentRecorded: boolean
  enrollmentDate: Date
  externalIdentifier: { type: string; value: string } | null
  updateFields: string[]
}

function parseRegistration(values: Record<string, NormalizedValue>): RegistrationProfile {
  const operation = enumValue(
    values.registration_operation,
    ['CREATE', 'LINK', 'UPDATE'] as const,
    'registration_operation',
  )
  const code = canonicalCode(values.beneficiary_code)
  if (!code) throw new BadRequestException('beneficiary_code is invalid.')
  const subjectType = enumValue(
    values.subject_type,
    ['INDIVIDUAL', 'GROUP', 'COMMUNITY'] as const,
    'subject_type',
  )
  const enrollmentDate = exactDate(values.enrollment_date, 'enrollment_date')
  if (!enrollmentDate) throw new BadRequestException('enrollment_date is required.')
  if (enrollmentDate > new Date())
    throw new BadRequestException('enrollment_date cannot be future.')

  const participationConsent = values.consent_recorded
  const dataConsent = values.data_processing_consent_recorded
  if (participationConsent !== true || dataConsent !== true) {
    throw new BadRequestException(
      'Participation and data-processing consent must be explicitly recorded.',
    )
  }
  const isMinor = values.is_minor === true
  const guardianConsent = values.guardian_consent_recorded === true
  const birthDate = exactDate(values.birth_date, 'birth_date')
  const age = values.age_at_registration
  if (
    age !== null &&
    age !== undefined &&
    (!Number.isInteger(age) || Number(age) < 0 || Number(age) > 130)
  ) {
    throw new BadRequestException('age_at_registration must be an integer from 0 through 130.')
  }
  const ageAtRegistration = typeof age === 'number' ? age : null

  const firstName = text(values.first_name)
  const middleName = text(values.middle_name)
  const lastName = text(values.last_name)
  const explicitDisplayName = text(values.display_name)
  if (subjectType === 'INDIVIDUAL') {
    if (!firstName || !lastName) {
      throw new BadRequestException('Individual registrations require first_name and last_name.')
    }
    if (!birthDate && ageAtRegistration === null) {
      throw new BadRequestException(
        'Individual registrations require birth_date or age_at_registration.',
      )
    }
    if (birthDate && birthDate > enrollmentDate) {
      throw new BadRequestException('birth_date cannot be after enrollment_date.')
    }
    if (
      birthDate &&
      ageAtRegistration !== null &&
      yearsAt(birthDate, enrollmentDate) !== ageAtRegistration
    ) {
      throw new BadRequestException('birth_date and age_at_registration are inconsistent.')
    }
    const derivedAge = birthDate ? yearsAt(birthDate, enrollmentDate) : ageAtRegistration
    if ((derivedAge !== null && derivedAge < 18) !== isMinor) {
      throw new BadRequestException('is_minor must agree with the supplied birth date or age.')
    }
    if (isMinor !== guardianConsent) {
      throw new BadRequestException(
        'Guardian consent is required only for an explicitly identified minor.',
      )
    }
  } else {
    if (!explicitDisplayName)
      throw new BadRequestException('Group/community records require display_name.')
    if (
      firstName ||
      middleName ||
      lastName ||
      birthDate ||
      ageAtRegistration !== null ||
      isMinor ||
      guardianConsent ||
      (values.sex != null && values.sex !== 'NOT_SPECIFIED')
    ) {
      throw new BadRequestException(
        'Person-only name, age, birth and guardian fields do not apply to groups or communities.',
      )
    }
  }

  const identifierTypeValue = values.external_identifier_type
  const identifierValueValue = values.external_identifier_value
  const identifierType = canonicalIdentifierType(identifierTypeValue)
  const identifierValue = canonicalIdentifierValue(identifierValueValue)
  if (
    (identifierTypeValue != null || identifierValueValue != null) &&
    (!identifierType || !identifierValue)
  ) {
    throw new BadRequestException(
      'External identifier type and value must be supplied together and use a stable non-demographic namespace.',
    )
  }

  const updateFieldsValue = values.profile_update_fields
  const updateFields = Array.isArray(updateFieldsValue)
    ? updateFieldsValue.filter((item): item is string => typeof item === 'string')
    : []
  if (operation === 'UPDATE') {
    if (
      updateFields.length === 0 ||
      updateFields.some((field) => !writableProfileFields.has(field))
    ) {
      throw new BadRequestException(
        'UPDATE requires an explicit allowlisted profile_update_fields selection.',
      )
    }
  } else if (updateFields.length > 0) {
    throw new BadRequestException('profile_update_fields is only valid for UPDATE.')
  }

  return {
    operation,
    code,
    subjectType,
    displayName: explicitDisplayName ?? [firstName, middleName, lastName].filter(Boolean).join(' '),
    firstName,
    middleName,
    lastName,
    sex: enumValue(
      values.sex ?? 'NOT_SPECIFIED',
      ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'] as const,
      'sex',
    ),
    birthDate,
    ageAtRegistration,
    disabilityStatus: enumValue(
      values.disability_status ?? 'NOT_SPECIFIED',
      ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'] as const,
      'disability_status',
    ),
    locationBarangay: text(values.location_barangay),
    locationCityMunicipality: text(values.location_city_municipality),
    locationProvince: text(values.location_province),
    consentRecorded: true,
    dataProcessingConsentRecorded: true,
    isMinor,
    guardianConsentRecorded: guardianConsent,
    enrollmentDate,
    externalIdentifier:
      identifierType && identifierValue ? { type: identifierType, value: identifierValue } : null,
    updateFields,
  }
}

@Injectable()
export class BeneficiariesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(identity: ApplicationIdentity, projectId: string, query: BeneficiaryListQueryDto) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.read',
      async (tx, actor) => {
        const scopedProjectId = await this.requireProject(tx, actor, projectId)
        const search = query.search?.trim()
        const rows = await tx.beneficiary.findMany({
          where: {
            organizationId: actor.organizationId,
            ...(query.status ? { status: query.status } : { archivedAt: null }),
            beneficiaryProjectEnrollment_beneficiary: {
              some: { organizationId: actor.organizationId, projectId: scopedProjectId },
            },
            ...(search
              ? {
                  OR: [
                    { code: { contains: search, mode: 'insensitive' } },
                    { displayName: { contains: search, mode: 'insensitive' } },
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { middleName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : {}),
            ...(query.cursor ? { id: { gt: query.cursor.toLowerCase() } } : {}),
          },
          include: this.scopedIncludes(actor.organizationId, scopedProjectId),
          orderBy: { id: 'asc' },
          take: query.limit + 1,
        })
        const hasMore = rows.length > query.limit
        const page = rows.slice(0, query.limit)
        return {
          items: page.map((row) => this.mapBeneficiary(row, scopedProjectId)),
          nextCursor: hasMore ? page.at(-1)?.id : null,
        }
      },
    )
  }

  get(identity: ApplicationIdentity, projectId: string, beneficiaryId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.read',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        const row = await this.requireBeneficiary(tx, actor, project, beneficiaryId)
        return this.mapBeneficiary(row, project)
      },
    )
  }

  register(identity: ApplicationIdentity, projectId: string, input: RegisterBeneficiaryDto) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.register',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        const outcome = await this.promoteRegistration(tx, actor, {
          projectId: project,
          formId: input.formId,
          clientRegistrationId: input.clientRegistrationId,
          values: input.values,
          source: 'DIRECT_ENTRY',
          validatedById: actor.userId,
        })
        if (outcome.kind === 'REVIEW') {
          throw new ConflictException({
            message: 'Registration requires authorized identity review.',
            code: outcome.code,
          })
        }
        const row = await this.requireBeneficiary(tx, actor, project, outcome.beneficiaryId)
        return this.mapBeneficiary(row, project)
      },
    )
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
  ): Promise<
    | { kind: 'PROCESSED'; beneficiaryId: string; enrollmentId: string; submissionId: string }
    | { kind: 'REVIEW'; code: string }
  > {
    const form = await tx.digitalForm.findFirst({
      where: {
        id: input.formId,
        organizationId: actor.organizationId,
        projectId: input.projectId,
        formType: 'BENEFICIARY_REGISTRATION',
        status: input.source === 'DIRECT_ENTRY' ? 'PUBLISHED' : { in: ['PUBLISHED', 'ARCHIVED'] },
      },
      select: {
        id: true,
        version: true,
        status: true,
        formField_form: { select: fieldSelection, orderBy: { sequenceNo: 'asc' } },
      },
    })
    if (!form) throw new NotFoundException('Published registration form unavailable.')
    const codes = new Set(form.formField_form.map((field) => field.code))
    if (requiredRegistrationFields.some((code) => !codes.has(code))) {
      throw new ConflictException(
        'Registration form does not implement the required domain field contract.',
      )
    }
    const validation = validateAndNormalizeFormData(
      form.formField_form.map(contract),
      input.values,
      'final',
    )
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Registration values are invalid.',
        errors: validation.errors,
      })
    }
    const values = validation.values as Record<string, NormalizedValue>
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
      const created = await tx.beneficiary.create({
        data: {
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
        select: { id: true },
      })
      beneficiaryId = created.id
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
    const submittedAt = new Date()
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
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
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
          profileFieldsChanged:
            registration.operation === 'UPDATE' ? registration.updateFields : [],
        },
      },
    })
    return {
      kind: 'PROCESSED',
      beneficiaryId,
      enrollmentId: enrollment.id,
      submissionId: submission.id,
    }
  }

  update(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: UpdateBeneficiaryDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.profiles.update',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        const current = await this.requireBeneficiary(tx, actor, project, beneficiaryId)
        await this.assertAllEnrollmentScope(tx, actor, current.id)
        this.assertSubjectProfile(input, current)
        const changed = await tx.beneficiary.updateMany({
          where: {
            id: current.id,
            organizationId: actor.organizationId,
            archivedAt: null,
            updatedAt: new Date(input.expectedUpdatedAt),
          },
          data: {
            subjectType: input.subjectType,
            displayName: input.displayName?.trim() || null,
            firstName: input.firstName?.trim() || null,
            middleName: input.middleName?.trim() || null,
            lastName: input.lastName?.trim() || null,
            sex: input.sex,
            birthDate: input.birthDate ? exactDate(input.birthDate, 'birthDate') : null,
            ageAtRegistration: input.ageAtRegistration,
            disabilityStatus: input.disabilityStatus,
            locationBarangay: input.locationBarangay?.trim() || null,
            locationCityMunicipality: input.locationCityMunicipality?.trim() || null,
            locationProvince: input.locationProvince?.trim() || null,
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('Beneficiary changed; reload before saving.')
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project,
            action: 'BENEFICIARY_PROFILE_UPDATED',
            entityType: 'Beneficiary',
            entityId: current.id,
            changes: { fields: Object.keys(input).filter((key) => key !== 'expectedUpdatedAt') },
          },
        })
        return this.mapBeneficiary(
          await this.requireBeneficiary(tx, actor, project, current.id),
          project,
        )
      },
    )
  }

  archive(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: ArchiveBeneficiaryDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.archive',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        const current = await this.requireBeneficiary(tx, actor, project, beneficiaryId)
        await this.assertAllEnrollmentScope(tx, actor, current.id)
        const now = new Date()
        const changed = await tx.beneficiary.updateMany({
          where: {
            id: current.id,
            organizationId: actor.organizationId,
            archivedAt: null,
            updatedAt: new Date(input.expectedUpdatedAt),
          },
          data: { status: 'ARCHIVED', archivedAt: now },
        })
        if (changed.count !== 1)
          throw new ConflictException('Beneficiary changed; reload before archiving.')
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project,
            action: 'BENEFICIARY_ARCHIVED',
            entityType: 'Beneficiary',
            entityId: current.id,
            changes: { archivedAt: now.toISOString() },
          },
        })
        return { id: current.id, status: 'ARCHIVED', archivedAt: now.toISOString() }
      },
    )
  }

  enroll(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: EnrollBeneficiaryDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.enrollments.manage',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        if (!UUID_PATTERN.test(beneficiaryId))
          throw new NotFoundException('Beneficiary unavailable.')
        const beneficiary = await tx.beneficiary.findFirst({
          where: {
            id: beneficiaryId.toLowerCase(),
            organizationId: actor.organizationId,
            archivedAt: null,
          },
          select: {
            id: true,
            beneficiaryProjectEnrollment_beneficiary: {
              where: { organizationId: actor.organizationId, projectId: project },
              select: { id: true },
              take: 1,
            },
          },
        })
        if (!beneficiary) throw new NotFoundException('Beneficiary unavailable.')
        if (
          beneficiary.beneficiaryProjectEnrollment_beneficiary.length === 0 &&
          !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.identities.review')
        ) {
          throw new NotFoundException('Beneficiary unavailable.')
        }
        const date = exactDate(input.enrollmentDate, 'enrollmentDate')
        if (!date || date > new Date()) throw new BadRequestException('Enrollment date is invalid.')
        const enrollment = await tx.beneficiaryProjectEnrollment.upsert({
          where: {
            organizationId_projectId_beneficiaryId: {
              organizationId: actor.organizationId,
              projectId: project,
              beneficiaryId: beneficiary.id,
            },
          },
          create: {
            organizationId: actor.organizationId,
            projectId: project,
            beneficiaryId: beneficiary.id,
            enrollmentDate: date,
            recordedById: actor.userId,
          },
          update: {},
          select: { id: true, enrollmentDate: true, status: true },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project,
            action: 'BENEFICIARY_ENROLLMENT_ENSURED',
            entityType: 'BeneficiaryProjectEnrollment',
            entityId: enrollment.id,
            changes: { beneficiaryId: beneficiary.id },
          },
        })
        return {
          id: enrollment.id,
          enrollmentDate: enrollment.enrollmentDate.toISOString().slice(0, 10),
          status: enrollment.status,
        }
      },
    )
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

  private assertSubjectProfile(
    input: UpdateBeneficiaryDto,
    current: Awaited<ReturnType<BeneficiariesService['requireBeneficiary']>>,
  ) {
    if (input.subjectType === 'INDIVIDUAL') {
      if (!input.firstName?.trim() || !input.lastName?.trim()) {
        throw new BadRequestException('Individual profiles require first and last names.')
      }
      const birthDate = input.birthDate ? exactDate(input.birthDate, 'birthDate') : null
      const enrollmentDate = current.beneficiaryProjectEnrollment_beneficiary[0]?.enrollmentDate
      if (!birthDate && input.ageAtRegistration === undefined) {
        throw new BadRequestException(
          'Individual profiles require a birth date or age at registration.',
        )
      }
      if (birthDate && enrollmentDate && birthDate > enrollmentDate) {
        throw new BadRequestException('Birth date cannot be after enrollment date.')
      }
      if (
        birthDate &&
        enrollmentDate &&
        input.ageAtRegistration !== undefined &&
        yearsAt(birthDate, enrollmentDate) !== input.ageAtRegistration
      ) {
        throw new BadRequestException('Birth date and age at registration are inconsistent.')
      }
      const age =
        birthDate && enrollmentDate
          ? yearsAt(birthDate, enrollmentDate)
          : (input.ageAtRegistration ?? null)
      if (age !== null && age < 18 !== current.isMinor) {
        throw new BadRequestException(
          'Age changes cannot contradict recorded minor/guardian consent facts.',
        )
      }
    } else if (
      !input.displayName?.trim() ||
      input.firstName ||
      input.middleName ||
      input.lastName ||
      input.birthDate ||
      input.ageAtRegistration !== undefined ||
      input.sex !== 'NOT_SPECIFIED'
    ) {
      throw new BadRequestException(
        'Group/community profiles require a display name and cannot use person-only fields.',
      )
    }
  }

  private async assertAllEnrollmentScope(
    tx: Tx,
    actor: ApplicationIdentity,
    beneficiaryId: string,
  ) {
    if (actor.roles[0] === 'SYSTEM_ADMINISTRATOR') return
    const inaccessibleEnrollment = await tx.beneficiaryProjectEnrollment.findFirst({
      where: {
        organizationId: actor.organizationId,
        beneficiaryId,
        status: 'ACTIVE',
        projectId: { notIn: actor.assignedProjectIds },
      },
      select: { id: true },
    })
    if (inaccessibleEnrollment) {
      throw new ForbiddenException(
        'Shared profile update requires access to every enrolled project.',
      )
    }
  }

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }

  private scopedIncludes(organizationId: string, projectId: string) {
    return {
      beneficiaryProjectEnrollment_beneficiary: {
        where: { organizationId, projectId },
        select: {
          id: true,
          projectId: true,
          enrollmentDate: true,
          status: true,
          endedDate: true,
          endReason: true,
          updatedAt: true,
        },
        take: 1,
      },
      beneficiaryConsentRecord_beneficiary: {
        where: { organizationId, projectId },
        select: { kind: true, source: true, recordedAt: true },
        orderBy: { recordedAt: 'desc' as const },
        take: 10,
      },
    } satisfies Prisma.BeneficiaryInclude
  }

  private async requireBeneficiary(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
  ) {
    if (!UUID_PATTERN.test(beneficiaryId)) throw new NotFoundException('Beneficiary unavailable.')
    const row = await tx.beneficiary.findFirst({
      where: {
        id: beneficiaryId.toLowerCase(),
        organizationId: actor.organizationId,
        beneficiaryProjectEnrollment_beneficiary: {
          some: { organizationId: actor.organizationId, projectId },
        },
      },
      include: this.scopedIncludes(actor.organizationId, projectId),
    })
    if (!row) throw new NotFoundException('Beneficiary unavailable.')
    return row
  }

  private mapBeneficiary(
    row: Awaited<ReturnType<BeneficiariesService['requireBeneficiary']>>,
    projectId: string,
  ) {
    const enrollment = row.beneficiaryProjectEnrollment_beneficiary[0]
    return {
      id: row.id,
      code: row.code,
      subjectType: row.subjectType,
      displayName: row.displayName ?? row.code,
      firstName: row.firstName,
      middleName: row.middleName,
      lastName: row.lastName,
      sex: row.sex,
      birthDate: row.birthDate?.toISOString().slice(0, 10),
      ageAtRegistration: row.ageAtRegistration,
      disabilityStatus: row.disabilityStatus,
      locationBarangay: row.locationBarangay,
      locationCityMunicipality: row.locationCityMunicipality,
      locationProvince: row.locationProvince,
      status: row.status,
      consentRecorded: row.consentRecorded,
      dataProcessingConsentRecorded: row.dataProcessingConsentRecorded,
      isMinor: row.isMinor,
      guardianConsentRecorded: row.guardianConsentRecorded,
      projectId,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            projectId,
            enrollmentDate: enrollment.enrollmentDate.toISOString().slice(0, 10),
            status: enrollment.status,
            endedDate: enrollment.endedDate?.toISOString().slice(0, 10),
            endReason: enrollment.endReason,
            updatedAt: enrollment.updatedAt.toISOString(),
          }
        : null,
      consentProvenance: row.beneficiaryConsentRecord_beneficiary.map((entry) => ({
        kind: entry.kind,
        source: entry.source,
        recordedAt: entry.recordedAt.toISOString(),
      })),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
