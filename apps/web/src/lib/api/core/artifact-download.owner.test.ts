import { saveCoreArtifact } from '@/lib/services/core-feature-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: vi.fn() } }),
}))

const click = vi.fn()
const remove = vi.fn()
const append = vi.fn()
const artifact = { blob: new Blob(['synthetic pdf bytes']), fileName: 'report-synthetic.pdf' }
let link: { href: string; download: string; click: typeof click; remove: typeof remove }
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  link = { href: '', download: '', click, remove }
  vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('saving a fetched artifact', () => {
  it('saves the artifact under its name while the owner is current', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    saveCoreArtifact(artifact, () => true)
    expect(link.href).toBe('blob:synthetic')
    expect(link.download).toBe('report-synthetic.pdf')
    expect(append).toHaveBeenCalledWith(link)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
  })
  it('refuses to save once the owner changed, and still removes the link and releases the URL', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    expect(() => saveCoreArtifact(artifact, () => false)).toThrow('Artifact ownership changed.')
    expect(append).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
  })
})
