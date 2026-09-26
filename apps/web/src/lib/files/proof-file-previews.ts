import type { ActivityProofFile } from '@/types/pathways'

interface ProofFilePreview {
  type: string
  url: string
}

const previews = new Map<string, ProofFilePreview>()
const previewStoragePrefix = 'pathways.proofPreview.'
const sessionPreviewMaxBytes = 4 * 1024 * 1024
let previewGeneration = 0
const previewStorage = () => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const previewId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `proof-file-${Date.now()}-${Math.random().toString(36).slice(2)}`

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('File preview could not be prepared.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })

export async function registerProofFilePreviews(files: File[]): Promise<ActivityProofFile[]> {
  const owner = previewGeneration
  let cancelled = false
  const owned: ActivityProofFile[] = []
  try {
    return await Promise.all(
      files.map(async (file) => {
        const id = previewId()
        const reference = { id, name: file.name, size: file.size, type: file.type }
        owned.push(reference)
        if (typeof URL.createObjectURL === 'function') {
          previews.set(id, { type: file.type, url: URL.createObjectURL(file) })
        }
        if (file.size <= sessionPreviewMaxBytes) {
          const url = await readDataUrl(file)
          if (cancelled || owner !== previewGeneration)
            throw new Error('File preview session changed.')
          try {
            const serialized = JSON.stringify({ type: file.type, url })
            if (new TextEncoder().encode(serialized).byteLength <= sessionPreviewMaxBytes)
              previewStorage()?.setItem(`${previewStoragePrefix}${id}`, serialized)
          } catch {
            // Object URL preview remains available in the current document when session quota is low.
          }
        }
        if (cancelled || owner !== previewGeneration)
          throw new Error('File preview session changed.')
        return reference
      }),
    )
  } catch (error) {
    cancelled = true
    releaseProofFilePreviews(owned)
    throw error
  }
}

export const getProofFilePreview = (id: string) => {
  const current = previews.get(id)
  if (current) return current
  try {
    const stored = previewStorage()?.getItem(`${previewStoragePrefix}${id}`)
    return stored ? (JSON.parse(stored) as ProofFilePreview) : undefined
  } catch {
    return undefined
  }
}

export function releaseProofFilePreviews(files: ActivityProofFile[]) {
  for (const file of files) {
    const preview = previews.get(file.id)
    if (preview) {
      try {
        URL.revokeObjectURL(preview.url)
      } catch {
        /* Continue cleanup. */
      }
    }
    previews.delete(file.id)
    try {
      previewStorage()?.removeItem(`${previewStoragePrefix}${file.id}`)
    } catch {
      /* Best effort. */
    }
  }
}

export function clearAllProofFilePreviews() {
  previewGeneration++
  releaseProofFilePreviews([...previews.keys()].map((id) => ({ id, name: '', size: 0, type: '' })))
}
