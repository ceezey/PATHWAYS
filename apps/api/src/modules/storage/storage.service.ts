import { Injectable } from '@nestjs/common'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import { readApiEnv } from '@pathways/config'

@Injectable()
export class StorageService {
  private readonly env = readApiEnv(process.env)

  private getClient(): SupabaseClient {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase storage helper is not configured yet.')
    }

    return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY)
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
