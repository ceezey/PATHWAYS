import { describe, expect, it, vi } from 'vitest'
import { type ApplicationProfile, developerAuthUserId } from './auth-access'
import {
  decodeWorkspaceContext,
  encodeWorkspaceContext,
  requestAuthorizedProjects,
  workspacePermissions,
} from './workspace-access'

const profile: ApplicationProfile = {
  id: developerAuthUserId,
  aal: 'aal2',
  userId: '40000000-0000-4000-8000-000000000004',
  organizationId: '30000000-0000-4000-8000-000000000003',
  fullName: 'Synthetic developer',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
}

describe('server-authoritative workspace integration', () => {
  it('stores only non-secret selectors, never role, permissions or bearer tokens', () => {
    const encoded = encodeWorkspaceContext(profile)
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual({
      authUserId: profile.id,
      userId: profile.userId,
      organizationId: profile.organizationId,
    })
    expect(decodeWorkspaceContext(encoded, profile.id)).toEqual({
      userId: profile.userId,
      organizationId: profile.organizationId,
    })
    expect(decodeWorkspaceContext(encoded, 'other-subject')).toBeUndefined()
    for (const invalid of [
      undefined,
      '',
      '%',
      '{}',
      encodeURIComponent(JSON.stringify({ ...profile, authUserId: 'other' })),
    ]) {
      expect(decodeWorkspaceContext(invalid, profile.id)).toBeUndefined()
    }
  })

  it('does not infer permissions from an administrator role or a cached role picker', async () => {
    const denied = { ...profile, permissions: [] }
    expect(workspacePermissions(denied).readProjects).toBe(false)
    expect(workspacePermissions(null).readProjects).toBe(false)
    const fetcher = vi.fn()
    await expect(
      requestAuthorizedProjects(
        'http://127.0.0.1:4000/api',
        'synthetic-bearer',
        denied,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('consumes scoped server rows directly without client-side authorization filtering', async () => {
    const rows = [
      {
        id: '50000000-0000-4000-8000-000000000005',
        code: 'SYNTHETIC',
        title: 'Scoped',
        status: 'ACTIVE',
      },
    ]
    const fetcher = vi.fn().mockResolvedValue(Response.json(rows))
    const signal = new AbortController().signal
    expect(
      await requestAuthorizedProjects(
        'http://127.0.0.1:4000/api',
        'synthetic-bearer',
        profile,
        signal,
        fetcher,
      ),
    ).toEqual(rows)
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/api/access/projects',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal,
        headers: {
          Authorization: 'Bearer synthetic-bearer',
          'X-Pathways-Organization-Id': profile.organizationId,
          'X-Pathways-User-Id': profile.userId,
        },
      }),
    )
  })

  it.each([401, 403, 404, 500])(
    'clears access on server denial %i without exposing error bodies',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('private diagnostic', { status }))
      await expect(
        requestAuthorizedProjects(
          'http://127.0.0.1:4000/api',
          'synthetic-bearer',
          profile,
          new AbortController().signal,
          fetcher,
        ),
      ).rejects.toThrow('Project access could not be verified.')
    },
  )

  it('refuses non-local APIs and malformed server responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ role: 'ADMIN' }))
    await expect(
      requestAuthorizedProjects(
        'https://example.invalid/api',
        'synthetic-bearer',
        profile,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('local')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(
      requestAuthorizedProjects(
        'http://127.0.0.1:4000/api',
        'synthetic-bearer',
        profile,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow()
  })
})
