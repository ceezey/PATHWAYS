import { z } from 'zod'

import { PathwaysClientError, requestFoundationResponse } from './request'
import { captureRequestOwner } from './request-owner'

// Reads one JSON response under the owner, size and format checks of an owned request, then validates it.
export async function ownedJsonRead<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.output<S>> {
  const current = captureRequestOwner(init.signal)
  if (!current())
    throw new PathwaysClientError('Current workspace access is required.', 'unauthorized')
  const response = await requestFoundationResponse(path, init)
  if (!current() || !response.headers.get('Content-Type')?.startsWith('application/json')) {
    await response.body?.cancel().catch(() => undefined)
    throw new PathwaysClientError('Response ownership or format changed.', 'unauthorized')
  }
  if (!response.body) throw new PathwaysClientError('Response unavailable.', 'network')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > 2_000_000 || !current())
        throw new PathwaysClientError('Response unavailable.', 'network')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  if (!current()) throw new PathwaysClientError('Request ownership changed.', 'unauthorized')
  const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
  if (!parsed.success) throw new PathwaysClientError('Response could not be validated.', 'network')
  return parsed.data
}

const uuid = z.guid()
// The project path of a request, refusing an id that is not a UUID before any request is made.
export const projectPath = (id: string) => `/projects/${uuid.parse(id)}`
// Posts a JSON body through the owned read.
export const ownedJsonPost = <S extends z.ZodTypeAny>(url: string, schema: S, body: unknown) =>
  ownedJsonRead(url, schema, { method: 'POST', body: JSON.stringify(body) })
