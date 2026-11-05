import {
  type DateOrder,
  IMPORT_ENGINEERING_LIMITS,
  fittingDateOrders,
} from '@pathways/imports/server'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { safeRawData } from './imports.helpers'

// The time column's date order: its mapping's when it has one, else the one order every value in the batch fits.
export async function timeColumnOrder(
  tx: Tx,
  actor: ApplicationIdentity,
  batch: { id: string; mappingRevision: number },
  key: string,
  uploadDate: string,
): Promise<DateOrder | null> {
  const mapping = await tx.metadataMapping.findFirst({
    where: {
      organizationId: actor.organizationId,
      importBatchId: batch.id,
      revision: batch.mappingRevision,
      sourceFieldName: key,
      status: 'MAPPED',
    },
    select: { dateOrder: true },
  })
  if (mapping?.dateOrder) return mapping.dateOrder as DateOrder
  const raws = await tx.dataImportRow.findMany({
    where: { organizationId: actor.organizationId, importBatchId: batch.id },
    select: { rawData: true },
    take: IMPORT_ENGINEERING_LIMITS.maxRows,
  })
  const orders = fittingDateOrders(
    raws.map((row) => safeRawData(row.rawData)[key]),
    Number(uploadDate.slice(0, 4)),
  )
  return orders.length === 1 ? orders[0] : null
}
