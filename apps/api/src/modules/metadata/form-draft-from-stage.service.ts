import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type DraftColumn,
  FormDraftError,
  type SupportedImportFileType,
  draftStageForm,
  parseSecureImport,
  selectPartColumns,
} from '@pathways/imports/server'
import {
  type DraftStageFormRequest,
  type DraftStageFormResponse,
  type FilePart,
  filePart,
  hasAtomicPermission,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { currentBusinessDate } from '../../common/time/business-date'
import { PrismaService } from '../../prisma/prisma.service'
import { requireBatchWithHeaders } from '../imports/import-batches.service'
import { checksum } from '../imports/imports.helpers'
import { StorageService } from '../storage/storage.service'
import { insertDraft } from './form-definitions.service'
import { assertDefinition } from './metadata.helpers'

const usableActivity = { archivedAt: null, status: { not: 'CANCELLED' } } as const
const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** A journey stage is shaped by whoever may manage journeys, so the draft step asks for it before any write. */
export function requireJourneyManage(actor: ApplicationIdentity) {
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'journeys.manage')) {
    throw new ForbiddenException('Journey stage authority is missing.')
  }
}

/** Checks the part belongs to a whole-file batch of this project, then returns the stored source to read it from. */
export async function readPartSource(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  partCode: string,
) {
  requireJourneyManage(actor)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  const parts = filePart.array().safeParse(batch.fileParts).data ?? []
  const part = parts.find((item) => item.code === partCode)
  if (!part || batch.parentBatchId || batch.storageStatus !== 'STORED') {
    throw new NotFoundException('Import part unavailable.')
  }
  return {
    batchId: batch.id,
    part,
    parts,
    uploadDate: currentBusinessDate(batch.createdAt),
    storageBucket: batch.storageBucket,
    storageObjectKey: batch.storageObjectKey,
    sourceChecksum: batch.sourceChecksum,
    sourceSheetName: batch.sourceSheetName,
    fileType: batch.fileType as SupportedImportFileType,
  }
}

/** The columns of one part with every value they hold, as the drafter reads them. */
export function partColumns(
  parsed: Parameters<typeof selectPartColumns>[0],
  part: FilePart,
): DraftColumn[] {
  const narrowed = selectPartColumns(parsed, part)
  return narrowed.sourceColumns.map((column) => ({
    key: column.key,
    columnIndex: column.columnIndex,
    header: column.header,
    sourceCode: column.sourceCode,
    values: narrowed.rows.map((row) => row.values[column.key]),
  }))
}

/** The newest published or draft form of the project whose stage date lists the part's code; this lookup is the file layout. */
export function findStageForm(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  partCode: string,
) {
  return tx.digitalForm.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId,
      status: { in: ['PUBLISHED', 'DRAFT'] },
      formField_form: { some: { code: 'stage_date', sourceNames: { has: partCode } } },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, journeyStageId: true },
  })
}

function stageCode(name: string, taken: Set<string>) {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
  const base = slug.length >= 2 ? slug : 'STAGE'
  let code = base
  for (let n = 2; taken.has(code); n++) code = `${base}_${n}`
  return code
}

/** The live stage with this name, else a new one at the end; a parent makes it a branch of that stage. */
export async function ensureJourneyStage(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  name: string,
  parentStageId: string | null = null,
): Promise<string> {
  const stages = await tx.journeyStage.findMany({
    where: { organizationId: actor.organizationId, projectId },
    select: { id: true, code: true, name: true, stageOrder: true, archivedAt: true },
    take: 1000,
  })
  const found = stages.find(
    (stage) => !stage.archivedAt && normalizedName(stage.name) === normalizedName(name),
  )
  if (found) return found.id
  if (parentStageId) {
    const parent = await tx.journeyStage.findFirst({
      where: { id: parentStageId, organizationId: actor.organizationId, projectId },
      select: { isTerminal: true },
    })
    if (!parent || parent.isTerminal) {
      throw new ConflictException('A parent stage must precede its child and cannot be terminal.')
    }
  }
  const stageOrder = Math.max(0, ...stages.map((stage) => stage.stageOrder)) + 1
  const code = stageCode(name, new Set(stages.map((stage) => stage.code)))
  const stageType = parentStageId ? 'BRANCH' : 'CORE'
  const created = await tx.journeyStage.create({
    data: {
      organizationId: actor.organizationId,
      projectId,
      code,
      name: name.trim().slice(0, 160),
      stageOrder,
      stageType,
      parentStageId,
      createdById: actor.userId,
    },
    select: { id: true },
  })
  await writeAuditLog(tx, actor, {
    projectId,
    action: 'JOURNEY_STAGE_CREATED_FROM_IMPORT',
    entityType: 'JourneyStage',
    entityId: created.id,
    changes: { code, stageOrder, stageType },
  })
  return created.id
}

/** The activity a stage form is bound to: the chosen one, else the stage's only usable one, else null. */
export async function resolveStageActivity(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  stageId: string,
  chosenActivityId?: string,
): Promise<string | null> {
  const scope = { organizationId: actor.organizationId, projectId }
  if (chosenActivityId) {
    const id = chosenActivityId.toLowerCase()
    const activity = UUID_PATTERN.test(id)
      ? await tx.projectActivity.findFirst({
          where: { id, ...scope, ...usableActivity },
          select: { id: true },
        })
      : null
    if (!activity) throw new NotFoundException('Activity unavailable.')
    const mappings = await tx.activityJourneyStageMapping.findMany({
      where: { ...scope, stageId },
      select: { activityId: true },
      take: 100,
    })
    if (!mappings.some((mapping) => mapping.activityId === id)) {
      await tx.activityJourneyStageMapping.create({
        data: {
          ...scope,
          activityId: id,
          stageId,
          sequenceOrder: mappings.length + 1,
          createdById: actor.userId,
        },
      })
      await writeAuditLog(tx, actor, {
        projectId,
        action: 'STAGE_ACTIVITY_LINKED_FROM_IMPORT',
        entityType: 'JourneyStage',
        entityId: stageId,
        changes: { activityId: id },
      })
    }
    return id
  }
  const usable = await tx.activityJourneyStageMapping.findMany({
    where: { ...scope, stageId, activity: usableActivity },
    select: { activityId: true },
    take: 2,
  })
  return usable.length === 1 ? usable[0].activityId : null
}

/** Writes the stage, its activity link and the draft form of one part; a part that already has a form returns it. */
export async function draftPartForm(
  tx: Tx,
  actor: ApplicationIdentity,
  input: {
    projectId: string
    batchId: string
    part: FilePart
    parts: readonly FilePart[]
    columns: readonly DraftColumn[]
    uploadDate: string
    activityId?: string
  },
): Promise<DraftStageFormResponse> {
  requireJourneyManage(actor)
  const projectId = await requireScopedProject(tx, actor, input.projectId)
  await tx.$queryRaw`SELECT id FROM pathways.projects WHERE id=${projectId}::uuid AND organization_id=${actor.organizationId}::uuid FOR UPDATE`
  const { part } = input
  const stageOf = async () => {
    const parentName = input.parts.find((item) => item.code === part.branchOf)?.name
    const parent = parentName ? await ensureJourneyStage(tx, actor, projectId, parentName) : null
    return ensureJourneyStage(tx, actor, projectId, part.name, parent)
  }
  const existing = await findStageForm(tx, actor, projectId, part.code)
  if (existing) {
    return {
      formId: existing.id,
      stageId: existing.journeyStageId ?? (await stageOf()),
      waitingForActivity: false,
    }
  }
  const stageId = await stageOf()
  const activityId = await resolveStageActivity(tx, actor, projectId, stageId, input.activityId)
  if (!activityId) return { formId: null, stageId, waitingForActivity: true }
  let drafted: ReturnType<typeof draftStageForm>
  try {
    drafted = draftStageForm({ part, columns: input.columns, uploadDate: input.uploadDate })
  } catch (error) {
    if (error instanceof FormDraftError) {
      throw new ConflictException({ message: error.message, code: error.code })
    }
    throw error
  }
  const definition = { ...drafted.definition, activityId, journeyStageId: stageId }
  assertDefinition(definition)
  const form = await insertDraft(
    tx,
    actor,
    projectId,
    definition,
    'FORM_DRAFT_FROM_IMPORT',
    {
      batchId: input.batchId,
      partCode: part.code,
      needsCheck: drafted.summary.needsCheck.length,
    },
    drafted.summary,
  )
  return { formId: form.id, stageId, waitingForActivity: false }
}

// Stage drafts read the stored file of an import batch; imports never import metadata, so the route lives here.
@Injectable()
export class FormDraftFromStageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  /** Drafts the survey form of one part of a stored file, reading the part's own columns from the stored source. */
  async draft(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    partCode: string,
    input: DraftStageFormRequest,
  ) {
    const source = await withAuthorizedOperation(
      this.prisma,
      identity,
      'forms.manage',
      (tx, actor) => readPartSource(tx, actor, projectId, batchId, partCode),
    )
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Private upload storage is not configured.')
    }
    let buffer: Buffer
    try {
      buffer = await this.storage.downloadPrivateFile(source.storageBucket, source.storageObjectKey)
    } catch {
      throw new ServiceUnavailableException('The private source object is unavailable.')
    }
    if (checksum(buffer) !== source.sourceChecksum) {
      throw new ConflictException('The stored source checksum does not match its reservation.')
    }
    const parsed = await parseSecureImport(buffer, source.fileType, {}, source.sourceSheetName)
    const columns = partColumns(parsed, source.part)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'forms.manage',
      (tx, actor) =>
        draftPartForm(tx, actor, {
          projectId,
          batchId: source.batchId,
          part: source.part,
          parts: source.parts,
          columns,
          uploadDate: source.uploadDate,
          activityId: input.activityId,
        }),
      { transactionTimeoutMs: 30_000 },
    )
  }
}
