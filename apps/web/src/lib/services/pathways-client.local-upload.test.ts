import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  webEnv: {
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: 'synthetic-token',
            user: { id: '73600000-0000-4000-8000-000000000001' },
          },
        },
        error: null,
      }),
    },
  }),
}))

import { pathwaysClient } from './pathways-client'

const reservationWith = (uploadUrl: string) => ({
  clientUpdateId: 'client-1',
  updateId: 'update-1',
  status: 'UPLOADING',
  files: [
    {
      evidenceId: 'evidence-1',
      fileName: 'a.png',
      contentType: 'image/png',
      byteSize: 1024,
      sha256: 'x'.repeat(64),
      storageReady: false,
      uploadUrl,
    },
  ],
})

const ids = {
  authUserId: '73600000-0000-4000-8000-000000000001',
  organizationId: '73600000-0000-4000-8000-000000000002',
  userId: '73600000-0000-4000-8000-000000000003',
}
const respond = (body: unknown) => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify(ids))}`,
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
}

const reserve = () =>
  pathwaysClient.reserveActivityProofUpload({
    projectId: 'project-a',
    activityId: 'activity-a',
    clientUpdateId: 'client-1',
    progressPercent: 10,
    note: 'note',
    files: [],
  })

afterEach(() => vi.unstubAllGlobals())

describe('activity proof upload URL on the local Supabase stack', () => {
  it('accepts the http loopback signed URL that pnpm dev:local issues', async () => {
    const body = reservationWith('http://127.0.0.1:54321/storage/v1/object/upload/sign/x?token=t')
    respond(body)
    await expect(reserve()).resolves.toMatchObject({ updateId: 'update-1' })
  })

  it('still rejects http on a different host or port', async () => {
    for (const url of ['http://127.0.0.1:9999/x', 'http://evil.example:54321/x']) {
      respond(reservationWith(url))
      await expect(reserve()).rejects.toMatchObject({ code: 'network' })
    }
  })
})
