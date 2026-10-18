import { PathwaysClientError, requestFoundationResponse } from '@/lib/api/core/request'
import { captureRequestOwner } from '@/lib/api/core/request-owner'

export type CoreArtifact = { blob: Blob; fileName: string }

/** Fetches an artifact as a typed Blob under the same owner and size checks as a download. */
export async function fetchCoreArtifact(
  url: string,
  fileName: string,
  isOwnerCurrent: () => boolean = () => true,
): Promise<CoreArtifact> {
  const owned = captureRequestOwner()
  const current = () => isOwnerCurrent() && owned()
  // Allows readable names but no control, path or reserved characters, leading dot, or long names.
  if (
    !current() ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters are rejected on purpose.
    !/^(?!\.)[^\x00-\x1f\\/:*?"<>|]{1,200}\.(csv|xlsx|xls|pdf|png|jpg)$/.test(fileName)
  )
    throw new PathwaysClientError('Current artifact access is required.', 'unauthorized')
  const response = await requestFoundationResponse(url, { signal: AbortSignal.timeout(20000) })
  if (!current() || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    throw new PathwaysClientError('Artifact ownership changed.', 'unauthorized')
  }
  const mime = response.headers.get('Content-Type')?.split(';')[0]
  if (
    !mime ||
    ![
      'text/csv',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
    ].includes(mime)
  ) {
    await response.body.cancel().catch(() => undefined)
    throw new PathwaysClientError('Artifact format unavailable.', 'network')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let count = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      count += part.value.length
      if (count > 10485760 || !current())
        throw new PathwaysClientError('Artifact unavailable.', 'network')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  if (!current() || count === 0)
    throw new PathwaysClientError('Artifact ownership changed.', 'unauthorized')
  const bytes = new Uint8Array(count)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const extensions: Record<string, string> = {
    'text/csv': 'csv',
    'application/pdf': 'pdf',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'image/png': 'png',
    'image/jpeg': 'jpg',
  }
  return {
    blob: new Blob([bytes], { type: mime }),
    fileName: fileName.replace(/\.[a-z0-9]+$/, `.${extensions[mime]}`),
  }
}

/** Saves an already fetched artifact through a short-lived object URL. */
export function saveCoreArtifact(
  artifact: CoreArtifact,
  isOwnerCurrent: () => boolean = () => true,
) {
  const objectUrl = URL.createObjectURL(artifact.blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = artifact.fileName
  try {
    if (!isOwnerCurrent())
      throw new PathwaysClientError('Artifact ownership changed.', 'unauthorized')
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

export async function downloadCoreArtifact(
  url: string,
  fileName: string,
  isOwnerCurrent: () => boolean = () => true,
) {
  saveCoreArtifact(await fetchCoreArtifact(url, fileName, isOwnerCurrent), isOwnerCurrent)
}
