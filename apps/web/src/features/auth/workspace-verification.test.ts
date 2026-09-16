import { describe, expect, it, vi } from 'vitest'
import { AuthAccessError } from './auth-access'
import { verificationFailure, verifyWorkspace } from './workspace-verification'

const base = 'http://127.0.0.1:4000/api'
const subject = '10000000-0000-4000-8000-000000000001'
const selected = {
  organizationId: '10000000-0000-4000-8000-000000000002',
  userId: '10000000-0000-4000-8000-000000000003',
}
const profile = {
  ...selected,
  id: subject,
  aal: 'aal2',
  fullName: 'Synthetic user',
  roles: ['PROJECT_MANAGER'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
}
const mfa = {
  authUserId: subject,
  aal: 'aal2',
  applicationAccessEnabled: true,
  enrollmentAllowed: true,
}
const run = (fetcher: typeof fetch, selection = undefined as typeof selected | undefined) =>
  verifyWorkspace(
    base,
    'synthetic-token',
    subject,
    new AbortController().signal,
    selection,
    fetcher,
  )

describe('bootstrap versus current-profile revalidation', () => {
  it('bootstraps once from MFA to discovery to a separately verified profile', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(mfa))
      .mockResolvedValueOnce(
        Response.json({
          authUserId: subject,
          workspaces: [{ ...selected, displayName: 'Synthetic' }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ user: profile }))
    expect(await run(fetcher)).toMatchObject({ access: 'ready', profile, clearContext: false })
    expect(fetcher.mock.calls.map((call) => new URL(call[0]).pathname)).toEqual([
      '/api/auth/mfa/status',
      '/api/auth/workspaces',
      '/api/auth/me',
    ])
    expect(fetcher.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer synthetic-token' })
  })
  it('revalidates an established selection with /me only, with no result cache', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ user: profile }))
    for (let index = 0; index < 2; index++)
      expect(await run(fetcher, selected)).toMatchObject({ access: 'ready', profile, mfa })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.every((call) => new URL(call[0]).pathname === '/api/auth/me')).toBe(
      true,
    )
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer synthetic-token',
        'X-Pathways-User-Id': selected.userId,
        'X-Pathways-Organization-Id': selected.organizationId,
      },
    })
  })
  it.each([429, 500, 502, 503, 504])(
    'keeps selectors but hides the profile after availability failure %i',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('PRIVATE_DO_NOT_RENDER', { status }))
      const result = await run(fetcher, selected)
      expect(result).toMatchObject({ access: 'unavailable', profile: null, clearContext: false })
      expect(JSON.stringify(result)).not.toContain('PRIVATE_DO_NOT_RENDER')
      expect(fetcher).toHaveBeenCalledTimes(1)
    },
  )
  it('does not retry discovery to evade a denied profile', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(Response.json(mfa))
    expect(await run(fetcher, selected)).toMatchObject({
      access: 'blocked',
      profile: null,
      clearContext: true,
    })
    expect(fetcher.mock.calls.map((call) => new URL(call[0]).pathname)).toEqual([
      '/api/auth/me',
      '/api/auth/mfa/status',
    ])
  })
  it('uses MFA only after an exceptional 403 is actually confirmed as aal1', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(Response.json({ ...mfa, aal: 'aal1' }))
    expect(await run(fetcher, selected)).toMatchObject({
      access: 'mfa_required',
      profile: null,
      clearContext: true,
    })
  })
  it('denies a password-only bootstrap without requesting a workspace', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...mfa, aal: 'aal1' }))
    expect(await run(fetcher)).toMatchObject({ access: 'mfa_required', profile: null })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not confuse a lost session with an outage', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    expect(await run(fetcher, selected)).toMatchObject({
      access: 'session_expired',
      profile: null,
      clearContext: true,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([
    { id: selected.userId },
    { userId: subject },
    { organizationId: subject },
    { permissions: [] },
  ])('rejects a profile that does not match the requested subject/context %#', async (override) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ user: { ...profile, ...override } }))
    expect(await run(fetcher, selected)).toMatchObject({
      access: 'blocked',
      profile: null,
      clearContext: true,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('fails closed on a malformed profile without inventing another role', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ user: { private: 'DO_NOT_RENDER' } }))
    const result = await run(fetcher, selected)
    expect(result).toMatchObject({ access: 'unavailable', profile: null })
    expect(JSON.stringify(result)).not.toContain('DO_NOT_RENDER')
  })
  it('returns an honest no-workspace state', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(mfa))
      .mockResolvedValueOnce(Response.json({ authUserId: subject, workspaces: [] }))
    expect(await run(fetcher)).toMatchObject({
      access: 'no_workspace',
      profile: null,
      mfa,
      clearContext: true,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('rejects a foreign MFA subject before workspace discovery', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ ...mfa, authUserId: selected.userId }))
    expect(await run(fetcher)).toMatchObject({ access: 'blocked', profile: null })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not accept a cancelled response even when the mock ignores its signal', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn().mockImplementation(async () => {
      controller.abort()
      return Response.json({ user: profile })
    })
    await expect(
      verifyWorkspace(base, 'synthetic', subject, controller.signal, selected, fetcher),
    ).rejects.toThrow()
  })
  it('takes changed membership from each fresh profile instead of previous grants', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ user: profile }))
      .mockResolvedValueOnce(Response.json({ user: { ...profile, permissions: [] } }))
    expect((await run(fetcher, selected)).access).toBe('ready')
    expect((await run(fetcher, selected)).access).toBe('blocked')
  })
  it.each(['network', 'timeout'] as const)('keeps a %s error separate from MFA', (status) => {
    expect(verificationFailure(new AuthAccessError(status))).toMatchObject({
      access: 'unavailable',
      profile: null,
      clearContext: false,
    })
  })
})
