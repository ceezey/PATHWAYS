import type { ActivityProofFile } from '@/types/pathways'

interface ProofFilePreview {
  type: string
  url: string
}

const previews = new Map<string, ProofFilePreview>()
const previewStoragePrefix = 'pathways.proofPreview.'
const sessionPreviewMaxBytes = 4 * 1024 * 1024

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
  return Promise.all(
    files.map(async (file) => {
      const id = previewId()
      if (typeof URL.createObjectURL === 'function') {
        previews.set(id, { type: file.type, url: URL.createObjectURL(file) })
      }
      if (file.size <= sessionPreviewMaxBytes && typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem(
            `${previewStoragePrefix}${id}`,
            JSON.stringify({ type: file.type, url: await readDataUrl(file) }),
          )
        } catch {
          // Object URL preview remains available in the current document when session quota is low.
        }
      }
      return { id, name: file.name, size: file.size, type: file.type }
    }),
  )
}

export const getProofFilePreview = (id: string) => {
  const current = previews.get(id)
  if (current || typeof sessionStorage === 'undefined') return current
  try {
    const stored = sessionStorage.getItem(`${previewStoragePrefix}${id}`)
    return stored ? (JSON.parse(stored) as ProofFilePreview) : undefined
  } catch {
    return undefined
  }
}

export function releaseProofFilePreviews(files: ActivityProofFile[]) {
  for (const file of files) {
    const preview = previews.get(file.id)
    if (preview) URL.revokeObjectURL(preview.url)
    previews.delete(file.id)
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(`${previewStoragePrefix}${file.id}`)
    }
  }
}
