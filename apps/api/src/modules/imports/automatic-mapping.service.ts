import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  AUTO_SMART_V2_LIMITS,
  AUTO_SMART_V3,
  type CoverageField,
  type SmartMatchDecision,
  importCoverage,
} from '@pathways/imports/server'
import type { AutomaticImportMappingRequest } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { parseAutomaticMappingReceipt } from './automatic-mapping-receipt'
import { stagedMatchInputs } from './batch-coverage'
import { matchColumns } from './batch-match-inputs'
import { lockBatch, requireBatch } from './import-batches.service'
import type { BatchRow } from './imports.mapper'

export async function recordAutomaticMapping(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  input: AutomaticImportMappingRequest,
) {
  const batch = await requireBatch(tx, actor, projectId, batchId)
  if (batch.uploadedById !== actor.userId)
    throw new ForbiddenException('Automatic mapping is unavailable.')
  // Lock before reading the matcher inputs so the recorder re-checks the same batch state.
  await lockBatch(tx, actor, batch.projectId, batch.id)
  const { decisions, fields, distinctValues } = await smartMappingInputs(tx, actor, batch)
  let receipt: unknown
  try {
    const rows = await tx.$queryRaw<Array<{ receipt: unknown }>>(Prisma.sql`
          SELECT pathways.p78_record_smart_mapping(
            ${batch.id}::uuid,
            ${input.expectedMappingRevision}::integer,
            ${AUTO_SMART_V3}::text,
            ${JSON.stringify(decisions)}::jsonb
          ) AS receipt
        `)
    if (rows.length !== 1)
      throw new ServiceUnavailableException('Automatic mapping is unavailable.')
    receipt = rows[0].receipt
  } catch (error) {
    const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null
    const code = meta && typeof meta === 'object' && 'code' in meta ? meta.code : null
    if (code === '22023') throw new BadRequestException('Invalid automatic mapping request.')
    if (code === '40001') throw new ConflictException('The import changed. Reload before retrying.')
    if (code === '42501') throw new ForbiddenException('Automatic mapping is unavailable.')
    throw new ServiceUnavailableException('Automatic mapping is unavailable.')
  }
  try {
    if (!receipt || typeof receipt !== 'object')
      throw new Error('Invalid automatic mapping receipt.')
    const covered = importCoverage({ decisions, fields, distinctValues })
    return parseAutomaticMappingReceipt(
      {
        ...receipt,
        coverage: covered.coverage,
        uncoveredColumns: covered.uncoveredColumns,
        unresolvedValues: covered.unresolvedValues,
      },
      batch.id,
    )
  } catch {
    throw new ServiceUnavailableException('Automatic mapping is unavailable.')
  }
}

/**
 * AUTO_SMART_V3 inputs, all scoped to the locked batch: stored headers, the pinned form's
 * fields and the staged raw values. Cell values stay in this function; only the matcher's
 * fixed-shape decisions and the coverage inputs leave it, and the distinct values go no further
 * than the in-process coverage count.
 */
async function smartMappingInputs(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: BatchRow,
): Promise<{
  decisions: SmartMatchDecision[]
  fields: CoverageField[]
  distinctValues: Record<string, unknown[]>
}> {
  if (
    batch.storageStatus !== 'STORED' ||
    !['UPLOADED', 'MAPPED'].includes(batch.status) ||
    batch.mappingRevision > 1 ||
    batch.totalRows < 1
  ) {
    throw new ConflictException('The import changed. Reload before retrying.')
  }
  const { sourceColumns, fields, raw, distinctValues } = await stagedMatchInputs(tx, actor, batch)
  try {
    const decisions = matchColumns(sourceColumns, raw, fields)
    return { decisions, fields, distinctValues }
  } catch {
    throw new BadRequestException('Invalid automatic mapping request.')
  }
}
