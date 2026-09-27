import { beforeEach, describe, expect, it, vi } from 'vitest'
import Page from './page'
const state = vi.hoisted(() => ({ authorize: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/rbac/server-access', () => ({ requireServerPage: state.authorize }))
vi.mock('next/navigation', () => ({ notFound: state.notFound }))
vi.mock('@/features/analytics/recommendations-workspace', () => ({
  RecommendationsWorkspace: () => null,
}))
beforeEach(() => {
  vi.resetAllMocks()
  state.authorize.mockResolvedValue(undefined)
  state.notFound.mockImplementation(() => {
    throw Error('NOT_FOUND')
  })
})
describe('recommendation detail server admission', () => {
  it('verifies the existing permission without passing the display ID as authority', async () => {
    const searchParams = Promise.resolve({})
    const id = 'ABCDEF00-0000-4000-8000-000000000001'
    const page = await Page({ params: Promise.resolve({ recommendationId: id }), searchParams })
    expect(state.authorize).toHaveBeenCalledWith('recommendations', { searchParams })
    expect(page.props.initialRecommendationId).toBe(id.toLowerCase())
  })
  it('stops before detail rendering when current access is denied', async () => {
    state.authorize.mockRejectedValue(Error('ACCESS_DENIED'))
    await expect(
      Page({
        params: Promise.resolve({ recommendationId: '10000000-0000-4000-8000-000000000001' }),
      }),
    ).rejects.toThrow('ACCESS_DENIED')
    expect(state.notFound).not.toHaveBeenCalled()
  })
  it('rejects malformed display IDs after authorization', async () => {
    await expect(
      Page({ params: Promise.resolve({ recommendationId: 'invalid' }) }),
    ).rejects.toThrow('NOT_FOUND')
    expect(state.authorize).toHaveBeenCalledOnce()
    expect(state.notFound).toHaveBeenCalledOnce()
  })
})
