import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { coreDataClient, coreFeatureClient, downloadCoreArtifact } from './core-feature-client'

const authUserId = '78000000-0000-4000-8000-000000000001'
const organizationId = '78000000-0000-4000-8000-000000000002'
const userId = '78000000-0000-4000-8000-000000000003'
const projectId = '78000000-0000-4000-8000-000000000004'
const otherId = '78000000-0000-4000-8000-000000000006'
const updatedAt = '2026-09-27T00:00:00.000Z'
const publication = {
  revision: 1,
  state: 'FOR_REVIEW',
  summary: 'A fictional approved project summary.',
  snapshot: {
    id: projectId,
    title: 'Fictional project',
    code: 'SYNTHETIC-1',
    approvedSummary: 'A fictional approved project summary.',
    area: null,
    sector: null,
    startDate: null,
    endDate: null,
  },
  submittedById: userId,
  approvedById: null,
  publishedById: null,
  updatedAt,
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch/header path and Core stream/Zod boundary.
const fetcher = vi.fn<typeof fetch>()
const click = vi.fn()
const remove = vi.fn()
const append = vi.fn()
let link: { href: string; download: string; click: typeof click; remove: typeof remove }
beforeEach(() => {
  vi.clearAllMocks()
  link = { href: '', download: '', click, remove }
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    createElement: vi.fn(() => link),
    body: { append },
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function delayedBody(contentType: string) {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
    },
  })
  const response = new Response(body, { headers: { 'Content-Type': contentType } })
  const reader = body.getReader()
  const read = vi.spyOn(reader, 'read')
  const cancel = vi.spyOn(reader, 'cancel')
  const release = vi.spyOn(reader, 'releaseLock')
  vi.spyOn(body, 'getReader').mockReturnValue(reader)
  return {
    response,
    read,
    cancel,
    release,
    send: (bytes: Uint8Array) => controller?.enqueue(bytes),
  }
}

describe('Core client request and strict response boundaries', () => {
  it('accepts only the allowlisted publication snapshot for the requested project', async () => {
    fetcher.mockResolvedValueOnce(json(publication))
    await expect(coreFeatureClient.publication(projectId)).resolves.toEqual(publication)
    fetcher.mockResolvedValueOnce(
      json({ ...publication, snapshot: { ...publication.snapshot, id: otherId } }),
    )
    await expect(coreFeatureClient.publication(projectId)).rejects.toThrow('could not be validated')
  })
  it.each(['privateNotes', 'beneficiaries', 'expenseAmount'])(
    'rejects private snapshot field %s',
    async (key) => {
      fetcher.mockResolvedValueOnce(
        json({
          ...publication,
          snapshot: { ...publication.snapshot, [key]: 'synthetic private data' },
        }),
      )
      await expect(coreFeatureClient.publication(projectId)).rejects.toThrow(
        'could not be validated',
      )
    },
  )
  it('honors an already aborted read signal before dispatch', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(coreDataClient.audit(undefined, controller.signal)).rejects.toThrow(
      'Current workspace access',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('refuses reads and downloads without a workspace cookie before dispatch', async () => {
    document.cookie = ''
    await expect(coreDataClient.audit()).rejects.toThrow('Current workspace access')
    await expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Current artifact access')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('cancels a JSON response arriving after ownership invalidation before reading its body', async () => {
    const response = json({ projectId, evaluations: [], criteria: [] })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const read = vi.spyOn(response.body, 'getReader')
    let finish: (value: Response) => void = () => {}
    fetcher.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const rejection = expect(coreDataClient.audit()).rejects.toThrow(
      'Response ownership or format changed',
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    clearSensitiveDraftStorage()
    finish(response)
    await rejection
    expect(cancel).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  })
  it('cancels an unexpected JSON response MIME before body parsing', async () => {
    const response = new Response('synthetic unexpected content', {
      headers: { 'Content-Type': 'text/html' },
    })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const read = vi.spyOn(response.body, 'getReader')
    fetcher.mockResolvedValueOnce(response)
    await expect(coreDataClient.audit()).rejects.toThrow('Response ownership or format changed')
    expect(cancel).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  })
  it('drops a body that completes after logout and return to the same cookie owner', async () => {
    const delayed = delayedBody('application/json')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(coreDataClient.audit()).rejects.toThrow('Response unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    clearSensitiveDraftStorage()
    delayed.send(
      new TextEncoder().encode(JSON.stringify({ projectId, evaluations: [], criteria: [] })),
    )
    await rejection
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
  it('cancels an oversized JSON body before parsing or accepting it', async () => {
    const delayed = delayedBody('application/json')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(coreDataClient.audit()).rejects.toThrow('Response unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    delayed.send(new Uint8Array(2_000_001))
    await rejection
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
})

describe('owned private artifact delivery', () => {
  it('does not save delayed bytes after the local project owner changes', async () => {
    const delayed = delayedBody('application/pdf')
    fetcher.mockResolvedValueOnce(delayed.response)
    const create = vi.spyOn(URL, 'createObjectURL')
    let current = true
    const rejection = expect(
      downloadCoreArtifact(
        `/projects/${projectId}/reports/${otherId}/export`,
        `report-${otherId}.pdf`,
        () => current,
      ),
    ).rejects.toThrow('Artifact unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    current = false
    delayed.send(new TextEncoder().encode('synthetic private bytes'))
    await rejection
    expect(create).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
  it('rejects ownership loss before transport completion without creating a download', async () => {
    const response = new Response('synthetic', { headers: { 'Content-Type': 'application/pdf' } })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const create = vi.spyOn(URL, 'createObjectURL')
    let finish: (response: Response) => void = () => {}
    fetcher.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const rejection = expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Artifact ownership changed')
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    document.cookie = 'pathways-context=another-owner'
    finish(response)
    await rejection
    expect(cancel).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })
  it('cancels artifacts exceeding 10 MiB and never saves them', async () => {
    const delayed = delayedBody('application/pdf')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Artifact unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    delayed.send(new Uint8Array(10_485_761))
    await rejection
    expect(click).not.toHaveBeenCalled()
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
  it('saves valid current bytes with the server MIME extension and releases the object URL', async () => {
    vi.useFakeTimers()
    fetcher.mockResolvedValueOnce(
      new Response('synthetic image bytes', { headers: { 'Content-Type': 'image/png' } }),
    )
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    await downloadCoreArtifact('/synthetic-receipt', 'receipt-synthetic.pdf', () => true)
    expect(create).toHaveBeenCalledOnce()
    expect(link.download).toBe('receipt-synthetic.png')
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
  })
  it('saves a readable report name produced by the reporting workspace', async () => {
    fetcher.mockResolvedValueOnce(
      new Response('synthetic pdf bytes', { headers: { 'Content-Type': 'application/pdf' } }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic')
    await downloadCoreArtifact('/synthetic-artifact', 'Hygiene Kits – Guiuan Evaluation report.pdf')
    expect(link.download).toBe('Hygiene Kits – Guiuan Evaluation report.pdf')
    expect(click).toHaveBeenCalledOnce()
  })
  it.each(['../report.pdf', 'a\\b.pdf', '.hidden.pdf', 'report.exe', `${'a'.repeat(201)}.pdf`])(
    'rejects the unsafe file name %j before fetching',
    async (name) => {
      await expect(downloadCoreArtifact('/synthetic-artifact', name)).rejects.toThrow(
        'Current artifact access is required',
      )
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it('rejects an unapproved MIME before saving', async () => {
    const response = new Response('<script>synthetic</script>', {
      headers: { 'Content-Type': 'text/html' },
    })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    fetcher.mockResolvedValueOnce(response)
    await expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Artifact format unavailable')
    expect(cancel).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
  })
})
