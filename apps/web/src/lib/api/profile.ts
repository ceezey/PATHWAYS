import { requestFoundation, requestFoundationResponse } from '@/lib/api/core/request'
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
  // The verified session's bearer carries the change; the browser never calls Supabase for it.
  async changePassword(password: string, verifiedAccessToken: string, isCurrent?: () => boolean) {
    await requestFoundationResponse(
      '/auth/password/change',
      {
        method: 'POST',
        body: JSON.stringify({ password }),
        headers: { Authorization: `Bearer ${verifiedAccessToken}` },
      },
      isCurrent,
    )
  },
}
