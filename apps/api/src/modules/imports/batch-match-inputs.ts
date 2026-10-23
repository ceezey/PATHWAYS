import {
  AUTO_SMART_V2_LIMITS,
  type CoverageField,
  IMPORT_ENGINEERING_LIMITS,
  type SmartMatchColumn,
} from '@pathways/imports/server'
import { CALCULATED_RULE_KINDS, fieldIntakeProperties, fieldIntakeRule } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { jsonStringArray } from '../../common/forms/form-field-contract'
import type { Tx } from '../../common/prisma/transaction'
import { safeRawData, type safeSourceColumns } from './imports.helpers'
import type { BatchRow } from './imports.mapper'

export const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

const parsed = <T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
) => {
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}

// Every staged row of one batch in row order, bounded by the import row limit.
export async function readStagedRaw(tx: Tx, actor: ApplicationIdentity, batch: BatchRow) {
  const rows = await tx.dataImportRow.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: batch.projectId,
      formId: batch.formId,
      importBatchId: batch.id,
    },
    select: { rawData: true },
    orderBy: { rowNumber: 'asc' },
    take: IMPORT_ENGINEERING_LIMITS.maxRows,
  })
  return rows.map((row) => safeRawData(row.rawData))
}

// The matcher's view of each column: a bounded sample and whether every value is blank.
export function smartMatchColumns(
  sourceColumns: ReturnType<typeof safeSourceColumns>,
  raw: Array<Record<string, unknown>>,
): SmartMatchColumn[] {
  const sampleRows = raw.slice(0, AUTO_SMART_V2_LIMITS.sampleRows)
  return sourceColumns.map((column) => ({
    key: column.key,
    columnIndex: column.columnIndex,
    header: column.header,
    samples: sampleRows.map((values) => values[column.key]),
    blank: raw.every((values) => isBlank(values[column.key])),
  }))
}

// The stored field columns the matcher and the coverage count read.
export const matchFieldSelection = {
  id: true,
  code: true,
  label: true,
  dataType: true,
  allowedValues: true,
  minimumLength: true,
  maximumLength: true,
  sourceNames: true,
  valueAliases: true,
  importDefault: true,
  rule: true,
  isRequired: true,
} satisfies Prisma.FormFieldSelect

export function coverageField(
  field: Prisma.FormFieldGetPayload<{ select: typeof matchFieldSelection }>,
): CoverageField {
  const rule = parsed(fieldIntakeRule, field.rule) ?? null
  return {
    id: field.id,
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    allowedValues: jsonStringArray(field.allowedValues),
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
    sourceNames: field.sourceNames,
    valueAliases: parsed(fieldIntakeProperties.valueAliases, field.valueAliases) ?? null,
    calculated: rule !== null && (CALCULATED_RULE_KINDS as readonly string[]).includes(rule.kind),
    required: field.isRequired,
    importDefault: field.importDefault,
    rule,
  }
}
