import { requestFoundation } from '@/lib/api/core/request'
import { type UpdateOwnProfileRequest, ownProfileResponse } from '@pathways/shared'

export const ownProfileClient = {
  async read() {
    return ownProfileResponse.parse(await requestFoundation('/profile'))
  },
  async update(input: UpdateOwnProfileRequest) {
    return ownProfileResponse.parse(
      await requestFoundation('/profile', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    )
  },
}
