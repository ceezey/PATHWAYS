import { describe, expect, it, vi } from 'vitest'
import { developerAuthUserId, requestAuthJson } from './auth-access'
import { parseWorkspaceResolution, resolveWorkspaceProfile } from './workspace-access'

const base = 'http://127.0.0.1:4000/api'
const workspace = {
  userId: '40000000-0000-4000-8000-000000000004',
  organizationId: '30000000-0000-4000-8000-000000000003',
  displayName: 'Synthetic workspace',
}
const resolution = { authUserId: developerAuthUserId, prototypeOnly: true, workspaces: [workspace] }
const profile = {
  id: developerAuthUserId,
  aal: 'aal2',
  ...workspace,
  fullName: 'Fixture',
  roles: ['PROJECT_OFFICER'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
}

describe('D1 zero/one/cardinality resolution', () => {
  it('accepts one and returns null for zero', () => {
    expect(parseWorkspaceResolution(resolution, developerAuthUserId)).toEqual(workspace)
    expect(
      parseWorkspaceResolution({ ...resolution, workspaces: [] }, developerAuthUserId),
    ).toBeNull()
  })
  it.each([
    { ...resolution, workspaces: [workspace, workspace] },
    { ...resolution, authUserId: workspace.userId },
    { ...resolution, prototypeOnly: false },
    { ...resolution, workspaces: [{ ...workspace, userId: 'forged' }] },
    { ...resolution, workspaces: [{ ...workspace, role: 'SYSTEM_ADMINISTRATOR' }] },
    { ...resolution, workspaces: [{ ...workspace, displayName: '' }] },
  ])('rejects foreign, malformed, ambiguous or metadata-authoritative responses %#', (value) => {
    expect(() => parseWorkspaceResolution(value, developerAuthUserId)).toThrow(
      'No protected access',
    )
  })
  it('binds discovery to the current session user', () => {
    expect(() => parseWorkspaceResolution(resolution, workspace.userId)).toThrow()
  })
  it('does not accept selectors on discovery or fetch a profile for zero memberships', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...resolution, workspaces: [] }))
    await expect(
      requestAuthJson(base, '/auth/workspaces', 'synthetic', undefined, workspace, fetcher),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    expect(
      await resolveWorkspaceProfile(
        base,
        'synthetic',
        developerAuthUserId,
        new AbortController().signal,
        fetcher,
      ),
    ).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer synthetic' })
  })
  it('auto-selects only the server result, then independently fetches a fresh profile', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(resolution))
      .mockResolvedValueOnce(Response.json({ user: profile }))
    const actual = await resolveWorkspaceProfile(
      base,
      'synthetic',
      developerAuthUserId,
      new AbortController().signal,
      fetcher,
    )
    expect(actual).toMatchObject({ userId: workspace.userId, roles: ['PROJECT_OFFICER'] })
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer synthetic',
        'X-Pathways-User-Id': workspace.userId,
        'X-Pathways-Organization-Id': workspace.organizationId,
      },
    })
  })
  it.each([
    { userId: workspace.organizationId },
    { organizationId: workspace.userId },
    { permissions: [] },
  ])('rejects profile changes inconsistent with discovery %#', async (override) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(resolution))
      .mockResolvedValueOnce(Response.json({ user: { ...profile, ...override } }))
    await expect(
      resolveWorkspaceProfile(
        base,
        'synthetic',
        developerAuthUserId,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('Access was denied')
  })
  it.each([401, 403, 503])(
    'denies revoked/expired/unavailable authority after discovery (%i)',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json(resolution))
        .mockResolvedValueOnce(new Response('private-detail', { status }))
      await expect(
        resolveWorkspaceProfile(
          base,
          'synthetic',
          developerAuthUserId,
          new AbortController().signal,
          fetcher,
        ),
      ).rejects.toThrow('No protected access')
    },
  )
  it('does not continue to profile reads after a cancelled discovery', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn().mockImplementation(async () => {
      controller.abort()
      return Response.json(resolution)
    })
    await expect(
      resolveWorkspaceProfile(base, 'synthetic', developerAuthUserId, controller.signal, fetcher),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
