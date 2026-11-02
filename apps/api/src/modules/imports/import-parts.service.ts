import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { SupportedImportFileType } from '@pathways/imports/server'
import { type FilePart, filePart, hasAtomicPermission } from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { requireBatchWithHeaders } from './import-batches.service'
import { uuidFromHash } from './imports.helpers'
import { findStageForm } from './stage-form-lookup'

const SURVEY_IMPORT_PERMISSIONS = [
  'imports.process',
  'participation.record',
  'assessments.record',
  'beneficiaries.records.read',
] as const

// A FAILED attempt keeps its key forever, so each part may spend up to this many keys per form version.
export const PART_MAX_ATTEMPTS = 5

/** The key of a part's batch, derived from sha256(parentClientImportId|partCode|formVersion), so starting again returns it; a later attempt after failures gets its own. */
export const partImportId = (
  parentClientImportId: string,
  partCode: string,
  formVersion: number,
  attempt = 0,
) =>
  uuidFromHash(`${parentClientImportId}|${partCode}|${formVersion}${attempt ? `|${attempt}` : ''}`)

/** Processing a survey writes participation, assessments and reads participants, so refuse a person who could not finish it. */
export function requireSurveyImportPermissions(actor: ApplicationIdentity) {
  if (
    !SURVEY_IMPORT_PERMISSIONS.every((name) =>
      hasAtomicPermission(actor.roles[0], actor.permissions, name),
    )
  ) {
    throw new ForbiddenException(
      'Importing surveys needs the record participation, record assessment and read participant records permissions.',
    )
  }
}

const storedParts = (value: unknown) => filePart.array().safeParse(value).data ?? []

/** Checks the person, the parent and the part's published form, then returns the stored source to copy. */
export async function readPartStart(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  parentId: string,
  partCode: string,
) {
  requireSurveyImportPermissions(actor)
  const parent = await requireBatchWithHeaders(tx, actor, projectId, parentId)
  const part = storedParts(parent.fileParts).find((item) => item.code === partCode)
  if (!part || parent.storageStatus !== 'STORED')
    throw new NotFoundException('Import part unavailable.')
  if (part.rows === 0) throw new ConflictException('This survey has no rows in the file.')
  const form = await findStageForm(tx, actor, parent.projectId, part.code, ['PUBLISHED'])
  if (!form) throw new ConflictException("Publish this survey's form first.")
  // Each FAILED child of this part and version has spent one key, so the next start takes a new one.
  const attempt = await tx.dataImportBatch.count({
    where: {
      organizationId: actor.organizationId,
      parentBatchId: parent.id,
      partCode: part.code,
      formVersion: form.version,
      status: 'FAILED',
    },
  })
  if (attempt >= PART_MAX_ATTEMPTS) {
    throw new ConflictException('Starting this survey failed repeatedly; upload the file again.')
  }
  const fields = await tx.formField.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: parent.projectId,
      formId: form.id,
    },
    select: { rule: true },
    take: 100,
  })
  return {
    parentId: parent.id,
    clientImportId: parent.clientImportId,
    part,
    formId: form.id,
    formVersion: form.version,
    attempt,
    answerKey: fields.some(
      (field) => (field.rule as { kind?: string } | null)?.kind === 'TOTAL_SCORE',
    ),
    storageBucket: parent.storageBucket,
    storageObjectKey: parent.storageObjectKey,
    sourceChecksum: parent.sourceChecksum,
    originalFileName: parent.originalFileName,
    sourceSheetName: parent.sourceSheetName,
    fileType: parent.fileType as SupportedImportFileType,
  }
}

/** True when a Total Score column of the narrowed file holds a value in any row. */
export function holdsScores(narrowed: {
  sourceColumns: Array<{ key: string; header: string }>
  rows: Array<{ values: Record<string, unknown> }>
}) {
  // The label match is the one the stage drafter seeds the total score field by.
  const keys = narrowed.sourceColumns
    .filter((column) => /^total score/i.test(column.header.trim()))
    .map((column) => column.key)
  return narrowed.rows.some((row) =>
    keys.some((key) => {
      const value = row.values[key]
      return !(value == null || (typeof value === 'string' && !value.trim()))
    }),
  )
}

/** The part a child batch holds, read from its parent so a resumed upload narrows the same columns. */
export async function readParentPart(
  tx: Tx,
  actor: ApplicationIdentity,
  parentBatchId: string,
  partCode: string,
): Promise<FilePart> {
  const parent = await tx.dataImportBatch.findFirst({
    where: { id: parentBatchId, organizationId: actor.organizationId },
    select: { fileParts: true },
  })
  const part = storedParts(parent?.fileParts).find((item) => item.code === partCode)
  if (!part) throw new NotFoundException('Import part unavailable.')
  return part
}

/** Refuses a file batch until every part that has rows has a batch that did not fail. */
export async function requireAllPartsStarted(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: { id: string; fileParts: unknown },
) {
  const needed = storedParts(batch.fileParts).filter((part) => part.rows > 0)
  if (needed.length === 0) return
  const children = await tx.dataImportBatch.findMany({
    where: {
      organizationId: actor.organizationId,
      parentBatchId: batch.id,
      status: { not: 'FAILED' },
    },
    select: { partCode: true },
    take: 500,
  })
  const started = new Set(children.map((child) => child.partCode))
  if (needed.some((part) => !started.has(part.code))) {
    throw new ConflictException('Start every survey in this file first.')
  }
}
