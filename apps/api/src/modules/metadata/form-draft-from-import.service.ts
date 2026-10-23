import { ConflictException, NotFoundException } from '@nestjs/common'
import {
  type DraftField,
  FormDraftError,
  draftFormFromImport,
  smartMatchColumnsV3,
} from '@pathways/imports/server'
import type { DraftFromImportRequest, DraftFromImportResponse } from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { currentBusinessDate } from '../../common/time/business-date'
import { coverageField, readStagedRaw, smartMatchColumns } from '../imports/batch-match-inputs'
import { requireBatchWithHeaders } from '../imports/import-batches.service'
import { safeSourceColumns } from '../imports/imports.helpers'
import { requireForm } from './form-lookup.service'
import { createVersion } from './form-versions.service'
import { assertDefinition } from './metadata.helpers'
import { fieldInput } from './metadata.mapper'

/**
 * Drafts the next version of a form from a staged import (spec 3.6). The batch must be staged in
 * this project and pinned to a published version of the same form code. Nothing is published,
 * and the audit row and the response carry field codes and counts only.
 */
export async function createDraftFromImport(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  input: DraftFromImportRequest,
): Promise<DraftFromImportResponse> {
  const source = await requireForm(tx, actor, projectId, formId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, input.batchId)
  if (batch.form.code !== source.code || batch.form.status !== 'PUBLISHED') {
    throw new NotFoundException('Import batch unavailable.')
  }
  if (
    batch.storageStatus !== 'STORED' ||
    !['UPLOADED', 'MAPPED'].includes(batch.status) ||
    batch.mappingRevision !== input.expectedMappingRevision ||
    batch.totalRows < 1
  ) {
    throw new ConflictException('The import changed. Reload before retrying.')
  }
  const sourceColumns = safeSourceColumns(batch.sourceHeaders)
  const raw = await readStagedRaw(tx, actor, batch)
  const decisions = smartMatchColumnsV3(
    smartMatchColumns(sourceColumns, raw),
    source.formField_form.map(coverageField),
  )
  let drafted: ReturnType<typeof draftFormFromImport>
  try {
    drafted = draftFormFromImport({
      formType: source.formType,
      fields: source.formField_form.map(
        (field): DraftField => ({ ...fieldInput(field), id: field.id }),
      ),
      columns: sourceColumns.map((column) => ({
        key: column.key,
        columnIndex: column.columnIndex,
        header: column.header,
        values: raw.map((values) => values[column.key]),
      })),
      decisions,
      uploadDate: currentBusinessDate(batch.createdAt),
    })
  } catch (error) {
    if (error instanceof FormDraftError) {
      throw new ConflictException({ message: error.message, code: error.code })
    }
    throw error
  }
  const definition = {
    code: source.code,
    name: source.name,
    description: source.description,
    formType: source.formType,
    activityId: source.activityId,
    journeyStageId: source.journeyStageId,
    fields: drafted.fields,
  }
  assertDefinition(definition)
  const form = await createVersion(
    tx,
    actor,
    source,
    { ...definition, expectedUpdatedAt: source.updatedAt.toISOString() },
    drafted.summary,
  )
  await writeAuditLog(tx, actor, {
    projectId: source.projectId,
    action: 'FORM_DRAFT_FROM_IMPORT',
    entityType: 'DigitalForm',
    entityId: form.id,
    changes: {
      batchId: batch.id,
      version: form.version,
      addedFields: drafted.summary.addedFields.length,
      needsCheck: drafted.summary.needsCheck.length,
    },
  })
  return { form, summary: drafted.summary }
}
