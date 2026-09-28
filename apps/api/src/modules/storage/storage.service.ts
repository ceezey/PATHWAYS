import { Injectable } from '@nestjs/common'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import { readApiEnv } from '@pathways/config'

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
    const signed: Array<{ path: string; uploadUrl: string }> = []
    for (const path of paths) {
      const { data, error } = await files.createSignedUploadUrl(path, { upsert: false })
      if (error || !data?.signedUrl || data.path !== path)
        throw new Error('A private upload URL could not be created.')
      signed.push({ path, uploadUrl: data.signedUrl })
    }
    return signed
  }

  async deleteFile(bucket: string, path: string) {
    const client = this.getClient()
    const { error } = await client.storage.from(bucket).remove([path])

    if (error) {
      throw error
    }

    return true
  }

  async generateSignedUrl(bucket: string, path: string, expiresIn = 60 * 15) {
    const client = this.getClient()
    const { error, data } = await client.storage.from(bucket).createSignedUrl(path, expiresIn)

    if (error) {
      throw error
    }

    return data
  }
}
