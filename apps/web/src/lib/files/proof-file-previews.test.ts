// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllProofFilePreviews,
  getProofFilePreview,
  registerProofFilePreviews,
  releaseProofFilePreviews,
} from './proof-file-previews'

const readers: Array<{
  result: string
  onload: (() => void) | null
  onerror: (() => void) | null
}> = []
beforeEach(() => {
  readers.length = 0
  vi.stubGlobal(
    'FileReader',
    class {
      result = 'data:text/plain;base64,c3ludGhldGlj'
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        readers.push(this)
      }
    },
  )
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:synthetic-${readers.length}`),
    revokeObjectURL: vi.fn(),
  })
})
afterEach(() => {
  clearAllProofFilePreviews()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})
describe('proof preview invalidation', () => {
  it('rejects a pending result after invalidation and cannot repopulate storage', async () => {
    const pending = registerProofFilePreviews([new File(['synthetic'], 'proof.txt')])
    const rejected = expect(pending).rejects.toThrow('File preview session changed')
    clearAllProofFilePreviews()
    readers[0].onload?.()
    await rejected
    expect(window.sessionStorage.length).toBe(0)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
  it('releases one attempt without deleting a concurrent attempt', async () => {
    const first = registerProofFilePreviews([new File(['a'], 'a.txt')])
    const second = registerProofFilePreviews([new File(['b'], 'b.txt')])
    readers[0].onload?.()
    readers[1].onload?.()
    const [a, b] = await Promise.all([first, second])
    releaseProofFilePreviews(a)
    expect(getProofFilePreview(a[0].id)).toBeUndefined()
    expect(getProofFilePreview(b[0].id)).toBeDefined()
  })
  it('counts base64 serialization bytes before persisting', async () => {
    const pending = registerProofFilePreviews([new File(['x'], 'large.txt')])
    readers[0].result = `data:text/plain;base64,${'a'.repeat(4 * 1024 * 1024)}`
    readers[0].onload?.()
    const files = await pending
    expect(getProofFilePreview(files[0].id)).toBeDefined()
    expect(window.sessionStorage.length).toBe(0)
  })
})
