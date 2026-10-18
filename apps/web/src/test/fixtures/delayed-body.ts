import { vi } from 'vitest'

export function delayedBody(contentType: string) {
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
