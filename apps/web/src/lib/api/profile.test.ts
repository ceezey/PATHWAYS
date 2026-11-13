import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  requestFoundation: vi.fn(),
  requestFoundationResponse: vi.fn(),
}))
vi.mock('@/lib/api/core/request', () => ({
  requestFoundation: request.requestFoundation,
  requestFoundationResponse: request.requestFoundationResponse,
}))

import { ownProfileClient } from './profile'

const profile = {
  fullName: 'Synthetic User',
  contactNumber: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => {
  request.requestFoundation.mockReset()
  request.requestFoundationResponse.mockReset()
})

describe('own profile client', () => {
  it('reads the profile and parses the response', async () => {
    request.requestFoundation.mockResolvedValue(profile)
    await expect(ownProfileClient.read()).resolves.toEqual(profile)
    expect(request.requestFoundation).toHaveBeenCalledWith('/profile')
  })

  it('patches the profile with the expected revision and returns the saved one', async () => {
    request.requestFoundation.mockResolvedValue({ ...profile, contactNumber: '+63 900 000 0000' })
    const input = {
      fullName: 'Synthetic User',
      contactNumber: '+63 900 000 0000',
      expectedUpdatedAt: profile.updatedAt,
    }
    await expect(ownProfileClient.update(input)).resolves.toMatchObject({
      contactNumber: '+63 900 000 0000',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith('/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  })

  it('posts only the password to the change route with the verified bearer', async () => {
    request.requestFoundationResponse.mockResolvedValue(new Response(null, { status: 204 }))
    const isCurrent = () => true
    await expect(
      ownProfileClient.changePassword('Str0ng!Passw0rd#1', 'verified-token', isCurrent),
    ).resolves.toBeUndefined()
    expect(request.requestFoundationResponse).toHaveBeenCalledWith(
      '/auth/password/change',
      {
        method: 'POST',
        body: JSON.stringify({ password: 'Str0ng!Passw0rd#1' }),
        headers: { Authorization: 'Bearer verified-token' },
      },
      isCurrent,
    )
  })

  it.each([
    ['an unknown field', { ...profile, role: 'x' }],
    ['a missing name', { contactNumber: null, updatedAt: profile.updatedAt }],
    ['a revision that is not a timestamp', { ...profile, updatedAt: 'yesterday' }],
    ['a numeric contact', { ...profile, contactNumber: 5 }],
  ])('rejects a response with %s', async (_label, value) => {
    request.requestFoundation.mockResolvedValue(value)
    await expect(ownProfileClient.read()).rejects.toThrow()
    await expect(
      ownProfileClient.update({ fullName: 'a', contactNumber: '', expectedUpdatedAt: 'x' }),
    ).rejects.toThrow()
  })
})
