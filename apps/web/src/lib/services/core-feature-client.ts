import { ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'
import { PathwaysClientError, requestFoundationResponse } from '@/lib/api/core/request'
import { captureRequestOwner } from '@/lib/api/core/request-owner'
import { z } from 'zod'

const uuid = z.string().uuid()
const publicationSchema = z
  .object({
    revision: z.number().int().positive(),
    state: z.enum(['FOR_REVIEW', 'APPROVED', 'PUBLISHED']),
    summary: z.string().min(1).max(4000),
    snapshot: z
      .object({
        id: uuid,
        title: z.string().min(1).max(300),
        code: z.string().max(100),
        approvedSummary: z.string().min(1).max(4000),
        area: z.string().max(500).nullable(),
        sector: z.string().max(300).nullable(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
      })
      .strict(),
    submittedById: uuid,
    approvedById: uuid.nullable(),
    publishedById: uuid.nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
const publicationReceipt = publicationSchema.pick({ revision: true, state: true, updatedAt: true })
const timestamp = z.string().datetime({ offset: true })
const auditSchema = z
  .object({
    id: uuid,
    occurredAt: timestamp,
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    projectId: uuid.nullable(),
    actorUserId: uuid.nullable(),
    actorName: z.string().nullable(),
  })
  .strict()
export const coreDataClient = {
  audit: (cursor?: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `/audit${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      z.object({ rows: z.array(auditSchema).max(100), nextCursor: z.string().nullable() }).strict(),
      { signal },
    ),
}

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
export const coreFeatureClient = {
  publication: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/publication`,
      publicationSchema.refine((row) => row.snapshot.id === id).nullable(),
      { signal },
    ),
  transitionPublication: (
    id: string,
    operation: 'submit' | 'approve' | 'publish' | 'withdraw',
    body: { clientRequestId: string; expectedRevision: number; summary?: string },
    signal?: AbortSignal,
  ) =>
    ownedJsonRead(`${projectPath(id)}/publication/${operation}`, publicationReceipt, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
}
