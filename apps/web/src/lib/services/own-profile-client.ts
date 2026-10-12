import { z } from 'zod'
import { requestFoundation } from './pathways-client'

const ownProfileResponseSchema = z
  .object({
    fullName: z.string(),
    contactNumber: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type OwnProfileRecord = z.infer<typeof ownProfileResponseSchema>

export const ownProfileClient = {
  async read() {
    return ownProfileResponseSchema.parse(await requestFoundation('/profile'))
  },
  async update(input: { fullName: string; contactNumber: string; expectedUpdatedAt: string }) {
    return ownProfileResponseSchema.parse(
      await requestFoundation('/profile', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    )
  },
}
