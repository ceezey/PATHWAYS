import { BadRequestException, NotFoundException } from '@nestjs/common'
import {
  AUTO_SMART_V2_LIMITS,
  AUTO_SMART_V3,
  type CoverageField,
  importCoverage,
} from '@pathways/imports/server'
import type { ImportCoverageResponse } from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { coverageField, isBlank, matchFieldSelection, readStagedRaw } from './batch-match-inputs'
import { safeSourceColumns } from './imports.helpers'
import type { BatchRow } from './imports.mapper'

/**
 * Matcher inputs scoped to one batch: stored headers, the pinned form's fields, the staged raw
 * values and the distinct non-blank values per column. Cell values never leave the callers' process.
 */
export async function stagedMatchInputs(tx: Tx, actor: ApplicationIdentity, batch: BatchRow) {
  const stored = await tx.dataImportBatch.findFirst({
    where: { id: batch.id, organizationId: actor.organizationId, projectId: batch.projectId },
    select: { sourceHeaders: true },
  })
  if (!stored) throw new NotFoundException('Import batch unavailable.')
  const sourceColumns = safeSourceColumns(stored.sourceHeaders)
  const storedFields = await tx.formField.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
    },
    select: matchFieldSelection,
    orderBy: { sequenceNo: 'asc' },
    take: AUTO_SMART_V2_LIMITS.maxFields + 1,
  })
  if (
    sourceColumns.length < 1 ||
    storedFields.length < 1 ||
    storedFields.length > AUTO_SMART_V2_LIMITS.maxFields
  ) {
    throw new BadRequestException('Invalid automatic mapping request.')
  }
  const raw = await readStagedRaw(tx, actor, batch)
  const distinct = new Map(sourceColumns.map((column) => [column.key, new Set<unknown>()]))
  for (const values of raw) {
    for (const column of sourceColumns) {
      const value = values[column.key]
      if (!isBlank(value)) distinct.get(column.key)?.add(value)
    }
  }
  return {
    sourceColumns,
    fields: storedFields.map(coverageField),
    raw,
    distinctValues: Object.fromEntries([...distinct].map(([key, values]) => [key, [...values]])),
  }
}

interface StoredDecision {
  sourceFieldName: string
  status: string
  validationMessage: string | null
  targetField: { code: string } | null
}

/**
 * Coverage of a batch still on its automatic AUTO_SMART_V3 revision, rebuilt from the stored
 * mapping rows with the inputs automatic mapping uses; null for any other batch. Counts only.
 */
export async function readBatchCoverage(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: BatchRow,
  mappings: readonly StoredDecision[],
): Promise<ImportCoverageResponse | null> {
  if (
    batch.storageStatus !== 'STORED' ||
    !['UPLOADED', 'MAPPED'].includes(batch.status) ||
    batch.mappingRevision !== 1 ||
    mappings.length < 1 ||
    !mappings.every((mapping) => mapping.validationMessage?.startsWith(`${AUTO_SMART_V3}:`))
  ) {
    return null
  }
  try {
    const { fields, distinctValues } = await stagedMatchInputs(tx, actor, batch)
    const idByCode = new Map<string, CoverageField['id']>(fields.map((f) => [f.code, f.id]))
    const { coverage, uncoveredColumns, unresolvedValues } = importCoverage({
      decisions: mappings.map((mapping) => ({
        sourceKey: mapping.sourceFieldName,
        status:
          mapping.status === 'MAPPED' || mapping.status === 'IGNORED' ? mapping.status : 'PENDING',
        targetFieldId: (mapping.targetField && idByCode.get(mapping.targetField.code)) || null,
      })),
      fields,
      distinctValues,
    })
    return { coverage, uncoveredColumns, unresolvedValues }
  } catch (error) {
    if (error instanceof NotFoundException || error instanceof BadRequestException) return null
    throw error
  }
}
