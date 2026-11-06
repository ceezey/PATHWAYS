import { BadRequestException, ConflictException } from '@nestjs/common'
import {
  IMPORT_ENGINEERING_LIMITS,
  buildImportValueMap,
  compatibleImportDataTypes,
} from '@pathways/imports/server'
import type { SaveImportMappingRequest } from '@pathways/shared'
import { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { lockBatch, mapStoredBatch, requireBatchWithHeaders } from './import-batches.service'
import { safeSourceColumns } from './imports.helpers'

export async function saveBatchMapping(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  batchId: string,
  input: SaveImportMappingRequest,
) {
  await lockBatch(tx, actor, projectId, batchId)
  const batch = await requireBatchWithHeaders(tx, actor, projectId, batchId)
  if (batch.processingRevision > 0) {
    throw new ConflictException('Mappings cannot change after row processing has started.')
  }
  if (!['UPLOADED', 'MAPPED', 'VALIDATED'].includes(batch.status)) {
    throw new ConflictException('This import is not ready for mapping.')
  }
  if (batch.mappingRevision !== input.expectedMappingRevision) {
    throw new ConflictException('The mapping changed; reload before saving.')
  }
  const sourceColumns = safeSourceColumns(batch.sourceHeaders)
  const sourceColumnKeys = sourceColumns.map((column) => column.key)
  if (input.mappings.length !== sourceColumnKeys.length) {
    throw new BadRequestException('Every source column must be mapped or explicitly ignored.')
  }
  const byHeader = new Map(input.mappings.map((item) => [item.sourceFieldName, item]))
  if (
    byHeader.size !== input.mappings.length ||
    sourceColumnKeys.some((key) => !byHeader.has(key))
  ) {
    throw new BadRequestException(
      'Mappings must reference each original source column exactly once.',
    )
  }
  const fields = await tx.formField.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
    },
    select: { id: true, code: true, dataType: true },
    take: IMPORT_ENGINEERING_LIMITS.maxMappedFields,
  })
  const byCode = new Map(fields.map((field) => [field.code, field]))
  const targets = new Set<string>()
  const revision = batch.mappingRevision + 1
  const data: Prisma.MetadataMappingCreateManyInput[] = sourceColumnKeys.map((sourceKey) => {
    const item = byHeader.get(sourceKey)
    if (!item) throw new BadRequestException('A source column mapping is missing.')
    if (item.ignored === Boolean(item.targetFieldCode)) {
      throw new BadRequestException('Each source column must be mapped or ignored, not both.')
    }
    if (item.ignored) {
      if (item.dataType || item.valueMap || item.dateOrder) {
        throw new BadRequestException(
          'An ignored column cannot carry a data type, value map or date order.',
        )
      }
      return {
        organizationId: actor.organizationId,
        projectId: batch.projectId,
        formId: batch.formId,
        importBatchId: batch.id,
        revision,
        sourceFieldName: sourceKey,
        status: 'IGNORED',
      }
    }
    const target = byCode.get(item.targetFieldCode ?? '')
    if (!target) throw new BadRequestException('A mapping targets an unavailable form field.')
    if (targets.has(target.id)) {
      throw new BadRequestException('Two source columns cannot target the same form field.')
    }
    if (targets.size >= IMPORT_ENGINEERING_LIMITS.maxMappedFields) {
      throw new BadRequestException('The mapping targets too many form fields.')
    }
    targets.add(target.id)
    if (item.dataType && !compatibleImportDataTypes(target.dataType).includes(item.dataType)) {
      throw new BadRequestException('The chosen data type does not fit the target field.')
    }
    if (item.dateOrder && (item.dataType ?? target.dataType) !== 'DATE') {
      throw new BadRequestException('A date order applies only to a date column.')
    }
    if (item.valueMap) {
      try {
        buildImportValueMap(item.valueMap)
      } catch {
        throw new BadRequestException('The value map is oversized or has a duplicate source.')
      }
    }
    return {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      importBatchId: batch.id,
      revision,
      sourceFieldName: sourceKey,
      targetFieldId: target.id,
      status: 'MAPPED',
      dataType: item.dataType,
      valueMap: item.valueMap?.map(({ from, to }) => ({ from, to })),
      ...(item.dateOrder ? { dateOrder: item.dateOrder } : {}),
    }
  })
  await tx.metadataMapping.createMany({ data })
  await tx.dataImportRow.updateMany({
    where: { importBatchId: batch.id, organizationId: actor.organizationId },
    data: {
      status: 'PENDING',
      normalizedData: Prisma.DbNull,
      validationErrors: [],
      validationWarnings: [],
      mappingRevision: revision,
      validationRevision: 0,
      validatedById: null,
      validatedAt: null,
      processingClaimId: null,
      processingClaimedAt: null,
      processingErrorCode: null,
    },
  })
  await tx.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      status: 'MAPPED',
      mappingRevision: revision,
      validatedMappingRevision: null,
      reviewedById: null,
      validRows: 0,
      invalidRows: 0,
      processedRows: 0,
      unprocessedRows: 0,
      failedRows: 0,
      validatedAt: null,
      processedAt: null,
      failureCode: null,
    },
  })
  await writeAuditLog(tx, actor, {
    projectId: batch.projectId,
    action: 'IMPORT_MAPPING_REVISED',
    entityType: 'DataImportBatch',
    entityId: batch.id,
    changes: {
      revision,
      mapped: targets.size,
      ignored: sourceColumnKeys.length - targets.size,
      valueMapped: input.mappings.filter((item) => item.valueMap).length,
      dateOrdered: input.mappings.filter((item) => item.dateOrder).length,
    },
  })
  return mapStoredBatch(tx, actor, batch.projectId, batch.id)
}
