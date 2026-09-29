import { z } from 'zod'
const receiptSchema = z
  .object({
    batchId: z.string().uuid(),
    mappingRevision: z.literal(1),
    mapped: z.number().int().min(0).max(100),
    pending: z.number().int().min(0).max(500),
    requiredUnmapped: z.number().int().min(0).max(100),
    complete: z.boolean(),
  })
  .strict()
  .refine(
    (row) =>
      row.mapped + row.pending >= 1 &&
      row.mapped + row.pending <= 500 &&
      row.complete === (row.pending === 0 && row.requiredUnmapped === 0),
  )
export type AutomaticMappingReceipt = z.infer<typeof receiptSchema>
export function parseAutomaticMappingReceipt(
  value: unknown,
  expectedBatchId: string,
): AutomaticMappingReceipt {
  const row = receiptSchema.parse(value)
  if (row.batchId !== expectedBatchId.toLowerCase())
    throw new Error('Invalid automatic mapping receipt.')
  return row
}
