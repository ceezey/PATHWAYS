// Copies snapshot storage objects between Supabase Storage APIs with service role keys; upsert only.
const authHeaders = (key) => ({ apikey: key, authorization: `Bearer ${key}` })

/** Storage REST URL for one object, encoding each path segment. */
export function objectUrl(baseUrl, bucket, name) {
  const key = name.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${key}`
}

/** Drops media type parameters because hosted bucket allow lists name bare types such as text/csv. */
export const uploadContentType = (contentType) =>
  (contentType || 'application/octet-stream').split(';')[0].trim()

/** Downloads each object from the source and upserts it into the same bucket and path on the target. */
export async function copyObjects(
  objects,
  source,
  target,
  { fetchImpl = fetch, log = console.info } = {},
) {
  if (!source.key || !target.key)
    throw new Error('Storage copy needs service role keys for source and target.')
  for (const object of objects) {
    const label = `${object.bucket}/${object.name}`
    const download = await fetchImpl(objectUrl(source.url, object.bucket, object.name), {
      headers: authHeaders(source.key),
    })
    if (!download.ok) throw new Error(`Download failed (${download.status}) for ${label}.`)
    const body = Buffer.from(await download.arrayBuffer())
    const upload = await fetchImpl(objectUrl(target.url, object.bucket, object.name), {
      method: 'POST',
      headers: {
        ...authHeaders(target.key),
        'content-type': uploadContentType(object.contentType),
        'x-upsert': 'true',
      },
      body,
    })
    if (!upload.ok) {
      const reason = (await upload.text()).slice(0, 200)
      throw new Error(`Upload failed (${upload.status}) for ${label}: ${reason}`)
    }
  }
  log(`Copied ${objects.length} storage object(s).`)
  return objects.length
}

/** Refuses a copy whose target is the source, which would upsert objects onto themselves. */
export function assertDistinctStorage(source, target) {
  const norm = (url) => new URL(url).origin
  if (norm(source.url) === norm(target.url))
    throw new Error('Storage source and target are the same project; refusing to copy.')
}
