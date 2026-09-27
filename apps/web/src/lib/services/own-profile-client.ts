import { ownProfileResponseSchema } from '@/features/profile/own-profile-contract'
import { requestFoundation } from './pathways-client'

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
