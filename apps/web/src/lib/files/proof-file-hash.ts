// Client-side SHA-256, used only to declare a proof file at reservation time
// (cr-pathways-activity-progress-media 3.1). The declared digest is advisory: the server
// verifies it against the streamed upload before any evidence becomes ready.
export async function sha256Hex(file: File): Promise<string> {
  // Response(file).arrayBuffer() rather than file.arrayBuffer(): some test DOM
  // implementations do not implement Blob.arrayBuffer, but the fetch Response body reader
  // is always available wherever fetch itself is used (this module runs only in the browser).
  const buffer = await new Response(file).arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
