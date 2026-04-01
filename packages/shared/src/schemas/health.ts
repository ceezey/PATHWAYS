import { z } from 'zod'

export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.string(),
  version: z.string(),
})

export type HealthStatusDto = z.infer<typeof healthStatusSchema>
