import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import {
  type ArchiveBeneficiaryRequest,
  type ArchiveBeneficiaryResponse,
  type BeneficiaryListQuery,
  type BeneficiaryResponse,
  type EnrollBeneficiaryRequest,
  type EnrollBeneficiaryResponse,
  type RegisterBeneficiaryRequest,
  type RegistrationContextResponse,
  type UpdateBeneficiaryRequest,
  updateBeneficiaryRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { ageBandWhere, assertSubjectProfile } from './beneficiaries.helpers'
import { mapBeneficiary, scopedIncludes } from './beneficiaries.mapper'
import { canReadProgress, loadProgress } from './beneficiary-progress'
import { businessToday, exactDate } from './beneficiary-registration.helpers'
import { BeneficiaryRegistrationService } from './beneficiary-registration.service'
import { loadRegistrationContext } from './registration-context.service'

// The compiled update DTO carried every declared field, so the profile update audit lists all of them.
const auditedProfileFields = Object.keys(updateBeneficiaryRequest.shape).filter(
  (key) => key !== 'expectedUpdatedAt',
)

// Registration makes about 25 sequential round trips; 10s is too short on the pooled remote DB.
const REGISTRATION_TRANSACTION_TIMEOUT_MS = 20_000

@Injectable()
export class BeneficiariesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BeneficiaryRegistrationService)
    private readonly registration: BeneficiaryRegistrationService,
  ) {}

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
          items: page.map(
            (row): BeneficiaryResponse => ({
              ...mapBeneficiary(row, scopedProjectId),
              progress: progress
                ? (progress.get(row.beneficiaryProjectEnrollment_beneficiary[0]?.id ?? '') ?? {
                    restricted: false as const,
                    lastParticipation: null,
                    stage: null,
                  })
                : { restricted: true as const },
            }),
          ),
          nextCursor: hasMore ? page.at(-1)?.id : null,
        }
      },
    )
  }

  registrationContext(
    identity: ApplicationIdentity,
    projectId: string,
  ): Promise<RegistrationContextResponse> {
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
  ): Promise<RegistrationContextResponse> {
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
        return { ...mapBeneficiary(row, project.id), progress } satisfies BeneficiaryResponse
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
        const outcome = await this.registration.promoteRegistration(tx, actor, {
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
      { transactionTimeoutMs: REGISTRATION_TRANSACTION_TIMEOUT_MS },
    )
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
        const isMinor = assertSubjectProfile(input, current)
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
            isMinor,
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
        return {
          id: current.id,
          status: 'ARCHIVED',
          archivedAt: now.toISOString(),
        } satisfies ArchiveBeneficiaryResponse
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
        } satisfies EnrollBeneficiaryResponse
      },
    )
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
