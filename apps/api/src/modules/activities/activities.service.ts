import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { projectScope } from '@app/modules/auth/authorized-data.service'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '@app/modules/auth/developer-access'
import { StorageService } from '@app/modules/storage/storage.service'
import { PrismaService } from '@app/prisma/prisma.service'
import { readApiEnv } from '@pathways/config'
import type {
  CreateActivityDto,
  ReviewActivityUpdateDto,
  SaveMilestoneDto,
  SubmitActivityUpdateDto,
  TransitionActivityDto,
  UpdateActivityDto,
  UpdateMilestoneDto,
  UploadedProofFile,
} from './activities.dto'

type Tx = Prisma.TransactionClient

const activitySelection = {
  id: true,
  projectId: true,
  code: true,
  title: true,
  description: true,
  activityType: true,
  plannedStartDate: true,
  plannedEndDate: true,
  actualStartDate: true,
  actualEndDate: true,
  status: true,
  progressPercent: true,
  reviewedById: true,
  reviewedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  updatedAt: true,
  projectActivityAssignment_activity: {
    where: { status: 'ACTIVE' as const, endedAt: null },
    select: {
      projectAssignment: {
        select: { userId: true, user: { select: { fullName: true, email: true } } },
      },
    },
    orderBy: { id: 'asc' as const },
    take: 50,
  },
  activityUpdate_activity: {
    select: {
      id: true,
      progressPercent: true,
      note: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      reviewReason: true,
      updatedAt: true,
      submittedBy: { select: { fullName: true } },
      reviewedBy: { select: { fullName: true } },
      evidenceMedia_update: {
        where: { storageReady: true },
        select: { id: true, fileName: true, status: true, submittedAt: true },
        orderBy: { id: 'asc' as const },
        take: 10,
      },
    },
    orderBy: { submittedAt: 'asc' as const },
    take: 100,
  },
  activityJourneyStageMapping_activity: {
    select: { stageId: true },
    orderBy: { sequenceOrder: 'asc' as const },
    take: 100,
  },
} satisfies Prisma.ProjectActivitySelect

type ActivityRow = Prisma.ProjectActivityGetPayload<{ select: typeof activitySelection }>

const storedStatus = {
  NOT_STARTED: 'Planned',
  IN_PROGRESS: 'In Progress',
  FOR_REVIEW: 'For Review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const

const reviewStatus = {
  PENDING: 'Submitted',
  VERIFIED: 'Accepted',
  APPROVED: 'Accepted',
  REJECTED: 'Flagged',
} as const

function calendarDate(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? ''
}

export function activityPresentationStatus(
  status: keyof typeof storedStatus,
  plannedEndDate: Date | null,
  businessDate: string,
) {
  const overdue =
    Boolean(plannedEndDate) &&
    calendarDate(plannedEndDate) < businessDate &&
    !['COMPLETED', 'CANCELLED'].includes(status)
  return { overdue, status: overdue ? ('Overdue' as const) : storedStatus[status] }
}

export function activityTransitionAllowed(
  current: keyof typeof storedStatus,
  requested: 'IN_PROGRESS' | 'CANCELLED',
) {
  return requested === 'IN_PROGRESS'
    ? current === 'NOT_STARTED'
    : ['NOT_STARTED', 'IN_PROGRESS'].includes(current)
}

function mapActivity(row: ActivityRow, businessDate: string) {
  const presentation = activityPresentationStatus(row.status, row.plannedEndDate, businessDate)
  const updates = row.activityUpdate_activity
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    title: row.title,
    description: row.description ?? '',
    activityType: row.activityType,
    storedStatus: row.status,
    status: presentation.status,
    overdue: presentation.overdue,
    startDate: calendarDate(row.plannedStartDate),
    dueDate: calendarDate(row.plannedEndDate),
    actualStartDate: calendarDate(row.actualStartDate) || null,
    actualEndDate: calendarDate(row.actualEndDate) || null,
    assignedUserIds: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.userId,
    ),
    assignedTo: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.user.fullName,
    ),
    assignedEmails: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.user.email,
    ),
    journeyStageIds: row.activityJourneyStageMapping_activity.map((mapping) => mapping.stageId),
    journeyStageId: row.activityJourneyStageMapping_activity[0]?.stageId ?? '',
    progress: row.progressPercent,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    submittedProof: updates.flatMap((update) =>
      update.evidenceMedia_update.map((proof) => ({
        id: proof.id,
        updateId: update.id,
        fileName: proof.fileName,
        status: reviewStatus[proof.status],
        submittedAt: proof.submittedAt.toISOString(),
        submittedBy: update.submittedBy.fullName,
        updateUpdatedAt: update.updatedAt.toISOString(),
        note: update.note,
      })),
    ),
    updateNotes: updates.map((update) => ({
      id: update.id,
      note: update.note,
      progress: update.progressPercent,
      status: reviewStatus[update.status],
      submittedBy: update.submittedBy.fullName,
      submittedAt: update.submittedAt.toISOString(),
      reviewedBy: update.reviewedBy?.fullName ?? null,
      reviewedAt: update.reviewedAt?.toISOString() ?? null,
      reviewReason: update.reviewReason,
      updatedAt: update.updatedAt.toISOString(),
    })),
    updatedAt: row.updatedAt.toISOString(),
    // P06/finance values are intentionally not synthesized in P05.
    indicatorIds: [],
    targetBeneficiaries: 0,
    beneficiariesReached: 0,
    budgetAllocation: 0,
    budgetLogged: 0,
  }
}

const proofTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
])
const maxProofBytes = 10 * 1024 * 1024
const maxTotalProofBytes = 25 * 1024 * 1024

function proofMetadata(files: UploadedProofFile[] | undefined) {
  const safe = files ?? []
  if (safe.length === 0) throw new BadRequestException('At least one proof file is required.')
  if (safe.length > 5) throw new BadRequestException('At most five proof files may be submitted.')
  if (safe.reduce((total, file) => total + file.size, 0) > maxTotalProofBytes) {
    throw new BadRequestException('The proof files exceed the total byte limit.')
  }
  return safe.map((file) => {
    const name = file.originalname.trim()
    const contentType = file.mimetype.toLowerCase()
    if (
      !file.buffer ||
      !Buffer.isBuffer(file.buffer) ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      file.size > maxProofBytes ||
      !name ||
      name.length > 128 ||
      name !== name.split(/[\\/]/).at(-1) ||
      !proofTypes.has(contentType)
    ) {
      throw new BadRequestException('A proof file has an invalid name, type, or size.')
    }
    const extension = extname(name)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 11)
    return {
      file,
      name,
      contentType,
      extension,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    }
  })
}

@Injectable()
export class ActivitiesService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  private businessDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.env.BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  }

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true, startDate: true, endDate: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project
  }

  private async requireActivity(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityId: string,
  ) {
    const project = await this.requireProject(tx, actor, projectId)
    if (!UUID_PATTERN.test(activityId)) throw new NotFoundException('Activity unavailable.')
    const activity = await tx.projectActivity.findFirst({
      relationLoadStrategy: 'join',
      where: {
        id: activityId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId: project.id,
        archivedAt: null,
      },
      select: activitySelection,
    })
    if (!activity) throw new NotFoundException('Activity unavailable.')
    return activity
  }

  private validateDates(
    start: string,
    end: string,
    project: { startDate: Date | null; endDate: Date | null },
  ) {
    if (end < start)
      throw new BadRequestException('Activity end date must not precede its start date.')
    const projectStart = calendarDate(project.startDate)
    const projectEnd = calendarDate(project.endDate)
    if ((projectStart && start < projectStart) || (projectEnd && end > projectEnd)) {
      throw new BadRequestException('Activity dates must fall within the project dates.')
    }
  }

  private async resolveAssignments(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    userIds: string[],
  ) {
    const ids = userIds.map((id) => id.toLowerCase())
    const assignments = await tx.userProjectAssignment.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        userId: { in: ids },
        status: 'ACTIVE',
        endedAt: null,
        user: { accountStatus: 'ACTIVE', archivedAt: null },
      },
      select: { id: true, userId: true },
      take: 50,
    })
    if (
      assignments.length !== ids.length ||
      new Set(assignments.map((row) => row.userId)).size !== ids.length
    ) {
      throw new BadRequestException(
        'Every activity assignee must have an active assignment to this project.',
      )
    }
    return assignments
  }

  list(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const project = await tx.project.findFirst({
        relationLoadStrategy: 'join',
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: {
          projectActivity_project: {
            where: { organizationId: actor.organizationId, archivedAt: null },
            select: activitySelection,
            orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        },
      })
      if (!project) throw new NotFoundException('Project unavailable.')
      const today = this.businessDate()
      return project.projectActivity_project.map((row) => mapActivity(row, today))
    })
  }

  get(identity: ApplicationIdentity, projectId: string, activityId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(activityId)) {
        throw new NotFoundException('Activity unavailable.')
      }
      const project = await tx.project.findFirst({
        relationLoadStrategy: 'join',
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: {
          projectActivity_project: {
            where: {
              id: activityId.toLowerCase(),
              organizationId: actor.organizationId,
              archivedAt: null,
            },
            select: activitySelection,
            take: 1,
          },
        },
      })
      const activity = project?.projectActivity_project[0]
      if (!activity) throw new NotFoundException('Activity unavailable.')
      return mapActivity(activity, this.businessDate())
    })
  }

  create(identity: ApplicationIdentity, projectId: string, input: CreateActivityDto) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.create',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        this.validateDates(input.plannedStartDate, input.plannedEndDate, project)
        const assignments = await this.resolveAssignments(
          tx,
          actor,
          project.id,
          input.assignedUserIds,
        )
        const activityId = randomUUID()
        await tx.projectActivity.create({
          data: {
            id: activityId,
            organizationId: actor.organizationId,
            projectId: project.id,
            code: input.code ?? `ACT-${activityId.slice(0, 8).toUpperCase()}`,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            activityType: input.activityType?.trim() || null,
            plannedStartDate: new Date(`${input.plannedStartDate}T00:00:00.000Z`),
            plannedEndDate: new Date(`${input.plannedEndDate}T00:00:00.000Z`),
            createdById: actor.userId,
          },
        })
        if (assignments.length) {
          await tx.projectActivityAssignment.createMany({
            data: assignments.map((assignment) => ({
              organizationId: actor.organizationId,
              projectId: project.id,
              activityId,
              projectAssignmentId: assignment.id,
              assignedById: actor.userId,
            })),
          })
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'ACTIVITY_CREATED',
            entityType: 'ProjectActivity',
            entityId: activityId,
            changes: { code: input.code ?? 'SERVER_GENERATED', assigneeCount: assignments.length },
          },
        })
        return mapActivity(
          await this.requireActivity(tx, actor, project.id, activityId),
          this.businessDate(),
        )
      },
    )
  }

  update(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: UpdateActivityDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.update',
      async (tx, actor) => {
        const current = await this.requireActivity(tx, actor, projectId, activityId)
        if (['COMPLETED', 'CANCELLED'].includes(current.status)) {
          throw new ConflictException('Terminal activity history cannot be edited.')
        }
        const project = await this.requireProject(tx, actor, projectId)
        this.validateDates(input.plannedStartDate, input.plannedEndDate, project)
        const expected = new Date(input.expectedUpdatedAt)
        if (
          Number.isNaN(expected.valueOf()) ||
          expected.valueOf() !== current.updatedAt.valueOf()
        ) {
          throw new ConflictException('Activity changed; reload before saving.')
        }
        const assignments = await this.resolveAssignments(
          tx,
          actor,
          project.id,
          input.assignedUserIds,
        )
        const changed = await tx.projectActivity.updateMany({
          where: { id: current.id, organizationId: actor.organizationId, updatedAt: expected },
          data: {
            code: input.code ?? current.code,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            activityType: input.activityType?.trim() || null,
            plannedStartDate: new Date(`${input.plannedStartDate}T00:00:00.000Z`),
            plannedEndDate: new Date(`${input.plannedEndDate}T00:00:00.000Z`),
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('Activity changed; reload before saving.')
        await tx.projectActivityAssignment.updateMany({
          where: {
            organizationId: actor.organizationId,
            projectId: project.id,
            activityId: current.id,
            status: 'ACTIVE',
          },
          data: {
            status: 'REMOVED',
            endedAt: new Date(),
            endReason: 'Activity assignment replaced.',
          },
        })
        if (assignments.length) {
          await tx.projectActivityAssignment.createMany({
            data: assignments.map((assignment) => ({
              organizationId: actor.organizationId,
              projectId: project.id,
              activityId: current.id,
              projectAssignmentId: assignment.id,
              assignedById: actor.userId,
            })),
          })
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'ACTIVITY_UPDATED',
            entityType: 'ProjectActivity',
            entityId: current.id,
            changes: { assigneeCount: assignments.length },
          },
        })
        return mapActivity(
          await this.requireActivity(tx, actor, project.id, current.id),
          this.businessDate(),
        )
      },
    )
  }

  transition(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: TransitionActivityDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.update',
      async (tx, actor) => {
        const current = await this.requireActivity(tx, actor, projectId, activityId)
        const expected = new Date(input.expectedUpdatedAt)
        if (expected.valueOf() !== current.updatedAt.valueOf())
          throw new ConflictException('Activity changed; reload before saving.')
        if (!activityTransitionAllowed(current.status, input.status)) {
          throw new ConflictException('The requested activity transition is not permitted.')
        }
        if (input.status === 'CANCELLED' && !input.reason?.trim()) {
          throw new BadRequestException('A cancellation reason is required.')
        }
        const now = new Date()
        const changed = await tx.projectActivity.updateMany({
          where: { id: current.id, organizationId: actor.organizationId, updatedAt: expected },
          data:
            input.status === 'IN_PROGRESS'
              ? {
                  status: 'IN_PROGRESS',
                  actualStartDate: new Date(`${this.businessDate(now)}T00:00:00.000Z`),
                }
              : { status: 'CANCELLED', cancelledAt: now, cancellationReason: input.reason?.trim() },
        })
        if (changed.count !== 1)
          throw new ConflictException('Activity changed; reload before saving.')
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: current.projectId,
            action: `ACTIVITY_${input.status}`,
            entityType: 'ProjectActivity',
            entityId: current.id,
            changes: input.status === 'CANCELLED' ? { reason: input.reason?.trim() } : {},
          },
        })
        return mapActivity(
          await this.requireActivity(tx, actor, current.projectId, current.id),
          this.businessDate(),
        )
      },
    )
  }

  async submitUpdate(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: SubmitActivityUpdateDto,
    files?: UploadedProofFile[],
  ) {
    const metadata = proofMetadata(files)
    const reservation = await withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => {
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        if (!['IN_PROGRESS', 'FOR_REVIEW'].includes(activity.status)) {
          throw new ConflictException('Only an in-progress activity can be submitted for review.')
        }
        const assigned = await tx.projectActivityAssignment.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            status: 'ACTIVE',
            endedAt: null,
            projectAssignment: { userId: actor.userId, status: 'ACTIVE', endedAt: null },
          },
          select: { id: true },
        })
        if (!assigned) throw new ForbiddenException('An active activity assignment is required.')
        const clientUpdateId = input.clientUpdateId.toLowerCase()
        const existing = await tx.activityUpdate.findFirst({
          where: {
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            clientUpdateId,
          },
          select: {
            id: true,
            projectId: true,
            activityId: true,
            progressPercent: true,
            note: true,
            evidenceMedia_update: {
              select: {
                id: true,
                fileName: true,
                sha256: true,
                bucket: true,
                objectKey: true,
                storageReady: true,
              },
            },
          },
        })
        if (existing) {
          const expectedFiles = metadata.map((item) => `${item.name}:${item.sha256}`).sort()
          const storedFiles = existing.evidenceMedia_update
            .map((item) => `${item.fileName}:${item.sha256}`)
            .sort()
          if (
            existing.projectId !== activity.projectId ||
            existing.activityId !== activity.id ||
            existing.progressPercent !== input.progressPercent ||
            existing.note !== input.note.trim() ||
            JSON.stringify(expectedFiles) !== JSON.stringify(storedFiles)
          )
            throw new ConflictException('The activity update id was reused with different input.')
          return {
            actor,
            activity,
            updateId: existing.id,
            evidence: existing.evidenceMedia_update,
            existing: true,
          }
        }
        if (activity.status !== 'IN_PROGRESS') {
          throw new ConflictException('Another activity update is already awaiting review.')
        }
        const updateId = randomUUID()
        await tx.activityUpdate.create({
          data: {
            id: updateId,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            clientUpdateId,
            progressPercent: input.progressPercent,
            note: input.note.trim(),
            submittedById: actor.userId,
          },
        })
        const evidence = metadata.map((item) => {
          const id = randomUUID()
          return {
            id,
            fileName: item.name,
            sha256: item.sha256,
            bucket: this.env.EVIDENCE_BUCKET,
            objectKey: `organizations/${actor.organizationId}/projects/${activity.projectId}/evidence/${id}/proof${item.extension}`,
            storageReady: false,
          }
        })
        for (const [index, row] of evidence.entries()) {
          await tx.evidenceMedia.create({
            data: {
              ...row,
              organizationId: actor.organizationId,
              projectId: activity.projectId,
              activityId: activity.id,
              activityUpdateId: updateId,
              type: input.progressPercent === 100 ? 'COMPLETION_PROOF' : 'PROGRESS_PROOF',
              byteSize: BigInt(metadata[index].file.size),
              contentType: metadata[index].contentType,
              description: input.note.trim(),
              submittedById: actor.userId,
            },
          })
        }
        return { actor, activity, updateId, evidence, existing: false }
      },
    )

    if (reservation.existing && reservation.evidence.every((row) => row.storageReady)) {
      return this.get(identity, reservation.activity.projectId, reservation.activity.id)
    }

    try {
      for (const [index, row] of reservation.evidence.entries()) {
        if (row.storageReady) continue
        try {
          await this.storage.uploadPrivateFile(
            row.bucket,
            row.objectKey,
            metadata[index].file.buffer,
            metadata[index].contentType,
          )
        } catch {
          const recovered = await this.storage
            .downloadPrivateFile(row.bucket, row.objectKey)
            .catch(() => null)
          if (!recovered || createHash('sha256').update(recovered).digest('hex') !== row.sha256)
            throw new Error('PROOF_UPLOAD_FAILED')
        }
      }
    } catch {
      throw new ServiceUnavailableException(
        'Proof upload is incomplete; retry with the same update id and files.',
      )
    }

    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => {
        const update = await tx.activityUpdate.findFirst({
          where: {
            id: reservation.updateId,
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            status: 'PENDING',
          },
          select: { id: true, activityId: true, projectId: true, progressPercent: true },
        })
        if (!update) throw new ConflictException('Activity update reservation is unavailable.')
        await tx.evidenceMedia.updateMany({
          where: { organizationId: actor.organizationId, activityUpdateId: update.id },
          data: { storageReady: true },
        })
        const current = await this.requireActivity(tx, actor, update.projectId, update.activityId)
        if (current.status === 'IN_PROGRESS') {
          await tx.projectActivity.update({
            where: { id: current.id },
            data: { status: 'FOR_REVIEW', progressPercent: update.progressPercent },
          })
        } else if (current.status !== 'FOR_REVIEW') {
          throw new ConflictException('The activity can no longer enter review.')
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: update.projectId,
            action: reservation.existing
              ? 'ACTIVITY_UPDATE_RECOVERED'
              : 'ACTIVITY_UPDATE_SUBMITTED',
            entityType: 'ActivityUpdate',
            entityId: update.id,
            changes: {
              progressPercent: update.progressPercent,
              proofCount: reservation.evidence.length,
            },
          },
        })
        return mapActivity(
          await this.requireActivity(tx, actor, update.projectId, update.activityId),
          this.businessDate(),
        )
      },
    )
  }

  reviewUpdate(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    updateId: string,
    input: ReviewActivityUpdateDto,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'evidence.review', async (tx, actor) => {
      const activity = await this.requireActivity(tx, actor, projectId, activityId)
      if (!UUID_PATTERN.test(updateId)) throw new NotFoundException('Activity update unavailable.')
      const update = await tx.activityUpdate.findFirst({
        where: {
          id: updateId.toLowerCase(),
          organizationId: actor.organizationId,
          projectId: activity.projectId,
          activityId: activity.id,
        },
        select: {
          id: true,
          status: true,
          submittedById: true,
          updatedAt: true,
          progressPercent: true,
          evidenceMedia_update: { select: { id: true, storageReady: true, status: true } },
        },
      })
      if (!update) throw new NotFoundException('Activity update unavailable.')
      if (update.submittedById === actor.userId)
        throw new ForbiddenException('A submitter cannot review their own update.')
      if (update.status !== 'PENDING' || activity.status !== 'FOR_REVIEW')
        throw new ConflictException('This update is no longer awaiting review.')
      const expected = new Date(input.expectedUpdatedAt)
      if (expected.valueOf() !== update.updatedAt.valueOf())
        throw new ConflictException('Activity update changed; reload before reviewing.')
      if (update.evidenceMedia_update.some((proof) => !proof.storageReady))
        throw new ConflictException('Proof upload is incomplete.')
      const now = new Date()
      await tx.activityUpdate.update({
        where: { id: update.id },
        data: {
          status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewedById: actor.userId,
          reviewedAt: now,
          reviewReason: input.reason.trim(),
        },
      })
      if (update.evidenceMedia_update.length) {
        await tx.evidenceMedia.updateMany({
          where: { activityUpdateId: update.id, status: 'PENDING' },
          data:
            input.decision === 'APPROVE'
              ? { status: 'VERIFIED', verifiedById: actor.userId, verifiedAt: now }
              : {
                  status: 'REJECTED',
                  rejectedById: actor.userId,
                  rejectedAt: now,
                  rejectionReason: input.reason.trim(),
                },
        })
      }
      await tx.projectActivity.update({
        where: { id: activity.id },
        data:
          input.decision === 'APPROVE'
            ? {
                status: 'COMPLETED',
                progressPercent: 100,
                actualEndDate: new Date(`${this.businessDate(now)}T00:00:00.000Z`),
                reviewedById: actor.userId,
                reviewedAt: now,
              }
            : { status: 'IN_PROGRESS', progressPercent: update.progressPercent },
      })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: activity.projectId,
          action:
            input.decision === 'APPROVE' ? 'ACTIVITY_UPDATE_APPROVED' : 'ACTIVITY_UPDATE_RETURNED',
          entityType: 'ActivityUpdate',
          entityId: update.id,
          changes: { reason: input.reason.trim() },
        },
      })
      return mapActivity(
        await this.requireActivity(tx, actor, activity.projectId, activity.id),
        this.businessDate(),
      )
    })
  }

  async downloadProof(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    evidenceId: string,
  ) {
    const metadata = await withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.read',
      async (tx, actor) => {
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        if (!UUID_PATTERN.test(evidenceId)) throw new NotFoundException('Proof unavailable.')
        const proof = await tx.evidenceMedia.findFirst({
          where: {
            id: evidenceId.toLowerCase(),
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            storageReady: true,
            activityUpdateId: { not: null },
          },
          select: { bucket: true, objectKey: true, fileName: true, contentType: true },
        })
        if (!proof) throw new NotFoundException('Proof unavailable.')
        return proof
      },
    )
    return {
      ...metadata,
      body: await this.storage.downloadPrivateFile(metadata.bucket, metadata.objectKey),
    }
  }

  listMilestones(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      const project = await this.requireProject(tx, actor, projectId)
      return tx.projectMilestone.findMany({
        where: { organizationId: actor.organizationId, projectId: project.id, archivedAt: null },
        orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
        take: 100,
      })
    })
  }

  createMilestone(identity: ApplicationIdentity, projectId: string, input: SaveMilestoneDto) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.update',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        if (input.targetDate) {
          this.validateDates(input.targetDate, input.targetDate, project)
        }
        const row = await tx.projectMilestone.create({
          data: {
            organizationId: actor.organizationId,
            projectId: project.id,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
          },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'MILESTONE_CREATED',
            entityType: 'ProjectMilestone',
            entityId: row.id,
          },
        })
        return row
      },
    )
  }

  updateMilestone(
    identity: ApplicationIdentity,
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.update',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        if (!UUID_PATTERN.test(milestoneId)) throw new NotFoundException('Milestone unavailable.')
        if (input.targetDate) {
          this.validateDates(input.targetDate, input.targetDate, project)
        }
        if (input.status === 'COMPLETED' && !input.completionDate) {
          throw new BadRequestException('A completed milestone requires its completion date.')
        }
        if (input.completionDate) {
          this.validateDates(input.completionDate, input.completionDate, project)
        }
        const expected = new Date(input.expectedUpdatedAt)
        const changed = await tx.projectMilestone.updateMany({
          where: {
            id: milestoneId.toLowerCase(),
            organizationId: actor.organizationId,
            projectId: project.id,
            archivedAt: null,
            updatedAt: expected,
          },
          data: {
            title: input.title.trim(),
            description: input.description?.trim() || null,
            targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
            status: input.status,
            completionDate:
              input.status === 'COMPLETED' && input.completionDate
                ? new Date(`${input.completionDate}T00:00:00.000Z`)
                : null,
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('Milestone changed; reload before saving.')
        const row = await tx.projectMilestone.findUniqueOrThrow({
          where: { id: milestoneId.toLowerCase() },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'MILESTONE_UPDATED',
            entityType: 'ProjectMilestone',
            entityId: row.id,
            changes: { status: row.status },
          },
        })
        return row
      },
    )
  }
}
