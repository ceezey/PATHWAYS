import { z } from 'zod'

// Body of POST imports/projects/:projectId/batches/:batchId/validate.
export const validateImportRequest = z
  .object({ expectedMappingRevision: z.number().int().min(1) })
  .strict()
export type ValidateImportRequest = z.infer<typeof validateImportRequest>
