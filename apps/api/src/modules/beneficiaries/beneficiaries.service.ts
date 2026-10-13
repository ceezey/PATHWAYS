import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import {
  type ArchiveBeneficiaryRequest,
  type BeneficiaryListQuery,
  type EnrollBeneficiaryRequest,
  type RegisterBeneficiaryRequest,
  type UpdateBeneficiaryRequest,
  beneficiaryRegistrationDefinitionErrors,
  hasAtomicPermission,
  updateBeneficiaryRequest,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { ageBandWhere, assertSubjectProfile } from './beneficiaries.helpers'
import { contract, fieldSelection, mapBeneficiary, scopedIncludes } from './beneficiaries.mapper'
import { canReadProgress, loadProgress } from './beneficiary-progress'
import {
  type NormalizedValue,
  type RegistrationProfile,
  businessToday,
  exactDate,
  normalizeIdentifier,
  parseRegistration,
  stableValues,
} from './beneficiary-registration.helpers'
import { type RegistrationContext, loadRegistrationContext } from './registration-context.service'

// The compiled update DTO carried every declared field, so the profile update audit lists all of them.
const auditedProfileFields = Object.keys(updateBeneficiaryRequest.shape).filter(
  (key) => key !== 'expectedUpdatedAt',
)

const registrationFormSelection = {
  id: true,
  version: true,
  status: true,
  formField_form: { select: fieldSelection, orderBy: { sequenceNo: 'asc' } },
} satisfies Prisma.DigitalFormSelect

export type RegistrationImportForm = Prisma.DigitalFormGetPayload<{
  select: typeof registrationFormSelection
}>

@Injectable()
export class BeneficiariesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(identity: ApplicationIdentity, projectId: string, query: BeneficiaryListQuery) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.read',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        const scopedProjectId = project.id
        const search = query.search?.trim()
        const ageReference = project.endDate
        if (query.ageBand && !ageReference) {
          throw new BadRequestException('Age-band filtering requires a project end date.')
        }

        const demographicAgeFilter: Prisma.BeneficiaryWhereInput =
          query.ageBand && ageReference ? ageBandWhere(ageReference, query.ageBand) : {}

        const enrollmentStatusFilter: Prisma.BeneficiaryProjectEnrollmentWhereInput['status'] =
          query.enrollmentStatus === 'EXITED'
            ? { in: ['DROPPED', 'TRANSFERRED', 'INACTIVE'] }
            : query.enrollmentStatus
              ? query.enrollmentStatus
              : undefined

        const beneficiaryWhere = {
          organizationId: actor.organizationId,
          ...(query.status ? { status: query.status } : { archivedAt: null }),
          ...(query.sex ? { sex: query.sex } : {}),
          ...(query.disabilityStatus ? { disabilityStatus: query.disabilityStatus } : {}),
          ...demographicAgeFilter,
          beneficiaryProjectEnrollment_beneficiary: {
            some: {
              organizationId: actor.organizationId,
              projectId: scopedProjectId,
              ...(enrollmentStatusFilter ? { status: enrollmentStatusFilter } : {}),
            },
          },
          ...(search
            ? {
                OR: [
                  { code: { contains: search, mode: 'insensitive' as const } },
                  { displayName: { contains: search, mode: 'insensitive' as const } },
                  { firstName: { contains: search, mode: 'insensitive' as const } },
                  { middleName: { contains: search, mode: 'insensitive' as const } },
                  { lastName: { contains: search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
          ...(query.cursor ? { id: { gt: query.cursor.toLowerCase() } } : {}),
        } satisfies Prisma.BeneficiaryWhereInput

        const rows = await tx.beneficiary.findMany({
          where: beneficiaryWhere,
          include: scopedIncludes(actor.organizationId, scopedProjectId),
          orderBy: { id: 'asc' },
          take: query.limit + 1,
        })
        const hasMore = rows.length > query.limit
        const page = rows.slice(0, query.limit)
        const progress = canReadProgress(actor)
          ? await loadProgress(
              tx,
              actor,
              scopedProjectId,
              page.flatMap((row) =>
                row.beneficiaryProjectEnrollment_beneficiary.map((enrollment) => enrollment.id),
              ),
            )
          : null
        return {
          items: page.map((row) => ({
            ...mapBeneficiary(row, scopedProjectId),
            progress: progress
              ? (progress.get(row.beneficiaryProjectEnrollment_beneficiary[0]?.id ?? '') ?? {
                  restricted: false as const,
                  lastParticipation: null,
                  stage: null,
                })
              : { restricted: true as const },
          })),
          nextCursor: hasMore ? page.at(-1)?.id : null,
        }
      },
    )
  }

  registrationContext(
    identity: ApplicationIdentity,
    projectId: string,
  ): Promise<RegistrationContext> {
    if (!UUID_PATTERN.test(projectId))
      throw new BadRequestException('Project identifier is invalid.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.register',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        return loadRegistrationContext(tx, actor, project.id)
      },
    )
  }

  /**
   * Provisions the fixed system default registration form for a project the registrar can
   * already register into, then returns the same blank definition shape as registration
   * context. The database function derives organization and actor, rechecks
   * beneficiaries.records.register with project scope, and is idempotent per project.
   */
  ensureDefaultRegistrationForm(
    identity: ApplicationIdentity,
    projectId: string,
  ): Promise<RegistrationContext> {
    if (!UUID_PATTERN.test(projectId))
      throw new BadRequestException('Project identifier is invalid.')
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.register',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        const [provisioned] = await tx.$queryRaw<Array<{ outcome: unknown }>>`
          SELECT outcome FROM pathways.ensure_default_registration_form(${project.id}::uuid)
        `
        if (provisioned?.outcome === 'CODE_IN_USE') {
          throw new ConflictException(
            'The default registration form code is already used by another form in this project.',
          )
        }
        if (provisioned?.outcome !== 'PROVISIONED' && provisioned?.outcome !== 'EXISTING') {
          throw new Error('Default registration form provisioning is unavailable.')
        }
        return loadRegistrationContext(tx, actor, project.id)
      },
    )
  }

  get(identity: ApplicationIdentity, projectId: string, beneficiaryId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.read',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        const row = await this.requireBeneficiary(tx, actor, project.id, beneficiaryId)
        const enrollmentId = row.beneficiaryProjectEnrollment_beneficiary[0]?.id
        const progress =
          canReadProgress(actor) && enrollmentId
            ? ((await loadProgress(tx, actor, project.id, [enrollmentId])).get(enrollmentId) ?? {
                restricted: false as const,
                lastParticipation: null,
                stage: null,
              })
            : { restricted: true as const }
        return { ...mapBeneficiary(row, project.id), progress }
      },
    )
  }

  register(identity: ApplicationIdentity, projectId: string, input: RegisterBeneficiaryRequest) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.register',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        const outcome = await this.promoteRegistration(tx, actor, {
          projectId: project.id,
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
        const row = await this.requireBeneficiary(tx, actor, project.id, outcome.beneficiaryId)
        return mapBeneficiary(row, project.id)
      },
    )
  }

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

  update(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: UpdateBeneficiaryRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.profiles.update',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        const current = await this.requireBeneficiary(tx, actor, project.id, beneficiaryId)
        await this.assertAllEnrollmentScope(tx, actor, current.id)
        assertSubjectProfile(input, current)
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
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'BENEFICIARY_PROFILE_UPDATED',
          entityType: 'Beneficiary',
          entityId: current.id,
          changes: { fields: auditedProfileFields },
        })
        return mapBeneficiary(
          await this.requireBeneficiary(tx, actor, project.id, current.id),
          project.id,
        )
      },
    )
  }

  archive(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: ArchiveBeneficiaryRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.records.archive',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        const current = await this.requireBeneficiary(tx, actor, project.id, beneficiaryId)
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
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'BENEFICIARY_ARCHIVED',
          entityType: 'Beneficiary',
          entityId: current.id,
          changes: { archivedAt: now.toISOString() },
        })
        return { id: current.id, status: 'ARCHIVED', archivedAt: now.toISOString() }
      },
    )
  }

  enroll(
    identity: ApplicationIdentity,
    projectId: string,
    beneficiaryId: string,
    input: EnrollBeneficiaryRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'beneficiaries.enrollments.manage',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        if (!UUID_PATTERN.test(beneficiaryId))
          throw new NotFoundException('Beneficiary unavailable.')
        const date = exactDate(input.enrollmentDate, 'enrollmentDate')
        if (!date || date > businessToday())
          throw new BadRequestException('Enrollment date is invalid.')
        const [result] = await tx.$queryRaw<
          Array<{ id: string; enrollment_date: Date; status: string }>
        >`
          SELECT * FROM pathways.p09_enroll(${project.id}::uuid, ${beneficiaryId.toLowerCase()}::uuid, ${date}::date)
        `
        if (!result) throw new NotFoundException('Beneficiary unavailable.')
        const enrollment = {
          id: result.id,
          enrollmentDate: result.enrollment_date,
          status: result.status,
        }
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'BENEFICIARY_ENROLLMENT_ENSURED',
          entityType: 'BeneficiaryProjectEnrollment',
          entityId: enrollment.id,
          changes: { beneficiaryId: beneficiaryId.toLowerCase() },
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
      include: scopedIncludes(actor.organizationId, projectId),
    })
    if (!row) throw new NotFoundException('Beneficiary unavailable.')
    return row
  }
}
