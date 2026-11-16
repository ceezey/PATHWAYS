import { Injectable } from '@nestjs/common'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import { readApiEnv } from '@pathways/config'

export type StoredObject = {
  name: string
  folder: boolean
  size: number
  checksum: string
  contentType: string
}

const LIST_PAGE = 1000
const REMOVE_BATCH = 100

@Injectable()
export class StorageService {
  private readonly env = readApiEnv(process.env)
  // One server-only client per process; it holds no per-user session.
  private client: SupabaseClient | null = null

  private getClient(): SupabaseClient {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase storage helper is not configured yet.')
    }
    this.client ??= createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return this.client
  }

  private async requirePrivateBucket(client: SupabaseClient, bucket: string) {
    const { data: bucketInfo, error: bucketError } = await client.storage.getBucket(bucket)
    if (bucketError || !bucketInfo || bucketInfo.public) {
      throw new Error('The configured upload bucket is unavailable or not private.')
    }
  }

  isConfigured() {
    return Boolean(this.env.SUPABASE_URL) && Boolean(this.env.SUPABASE_SERVICE_ROLE_KEY)
  }

  async uploadFile(bucket: string, path: string, body: Buffer | Uint8Array, contentType?: string) {
    const client = this.getClient()
    const { error, data } = await client.storage.from(bucket).upload(path, body, {
      contentType,
      upsert: true,
    })

    if (error) {
      throw error
    }

    return data
  }

  async uploadPrivateFile(
    bucket: string,
    path: string,
    body: Buffer | Uint8Array,
    contentType: string,
  ) {
    const client = this.getClient()
    await this.requirePrivateBucket(client, bucket)
    const { data, error } = await client.storage.from(bucket).upload(path, body, {
      contentType,
      upsert: false,
      cacheControl: 'no-store',
    })
    if (error) throw error
    return data
  }

  async downloadPrivateFile(bucket: string, path: string) {
    const client = this.getClient()
    await this.requirePrivateBucket(client, bucket)
    const { data, error } = await client.storage.from(bucket).download(path)
    if (error) throw error
    return Buffer.from(await data.arrayBuffer())
  }

  /**
   * Signed upload URLs for exact server-derived keys in a confirmed private bucket, one bucket
   * check for the whole batch. Upsert stays disabled, so a URL can create its object once and
   * never overwrite or read it. The URL carries the upload token: return it only to the
   * reserving user and never log or store it.
   */
  async createPrivateUploadUrls(bucket: string, paths: readonly string[]) {
    const client = this.getClient()
    await this.requirePrivateBucket(client, bucket)
    const files = client.storage.from(bucket)
    // uploadUrl is null when the object already exists: upsert stays disabled, so an earlier
    // upload is never replaced here and is verified (or deleted on mismatch) at finalize.
    const signed: Array<{ path: string; uploadUrl: string | null }> = []
    for (const path of paths) {
      const { data, error } = await files.createSignedUploadUrl(path, { upsert: false })
      if (error && isExistingObjectError(error)) {
        signed.push({ path, uploadUrl: null })
        continue
      }
      if (error || !data?.signedUrl || data.path !== path)
        throw new Error('A private upload URL could not be created.')
      signed.push({ path, uploadUrl: data.signedUrl })
    }
    return signed
  }

  /** One folder level under a prefix of a confirmed private bucket; folders have no size or checksum. */
  async listObjects(bucket: string, prefix: string): Promise<StoredObject[]> {
    const client = this.getClient()
    await this.requirePrivateBucket(client, bucket)
    const files = client.storage.from(bucket)
    const objects: StoredObject[] = []
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await files.list(prefix, { limit: LIST_PAGE, offset })
      if (error) throw error
      for (const entry of data) {
        const folder = entry.id === null
        const metadata = (folder ? {} : (entry.metadata ?? {})) as Record<string, unknown>
        objects.push({
          name: `${prefix}/${entry.name}`,
          folder,
          size: typeof metadata.size === 'number' ? metadata.size : 0,
          checksum: typeof metadata.eTag === 'string' ? metadata.eTag.replaceAll('"', '') : '',
          contentType: typeof metadata.mimetype === 'string' ? metadata.mimetype : '',
        })
      }
      if (data.length < LIST_PAGE) return objects
    }
  }

  async copyObject(bucket: string, from: string, to: string): Promise<void> {
    const client = this.getClient()
    await this.requirePrivateBucket(client, bucket)
    const { error } = await client.storage.from(bucket).copy(from, to)
    if (error) throw error
  }

  async removeFiles(bucket: string, paths: readonly string[]): Promise<void> {
    const client = this.getClient()
    await this.requirePrivateBucket(client, bucket)
    const files = client.storage.from(bucket)
    for (let index = 0; index < paths.length; index += REMOVE_BATCH) {
      const { error } = await files.remove(paths.slice(index, index + REMOVE_BATCH))
      if (error) throw error
    }
  }

  async deleteFile(bucket: string, path: string) {
    const client = this.getClient()
    const { error } = await client.storage.from(bucket).remove([path])

    if (error) {
      throw error
    }

    return true
  }

  async generateSignedUrl(bucket: string, path: string, expiresIn = 60 * 15, download?: string) {
    const client = this.getClient()
    const { error, data } = await client.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn, download === undefined ? undefined : { download })

    if (error) {
      throw error
    }

    return data
  }
}

function isExistingObjectError(error: unknown) {
  const { statusCode, message } = (error ?? {}) as { statusCode?: unknown; message?: unknown }
  return String(statusCode) === '409' || message === 'The resource already exists'
}

export function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const own = (key: string) => Object.getOwnPropertyDescriptor(error, key)?.value
  return (
    String(own('statusCode')) === '404' ||
    own('status') === 404 ||
    own('message') === 'Object not found'
  )
}
