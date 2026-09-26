import { BadGatewayException, Injectable } from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

import { readApiEnv } from '@pathways/config'
import { UUID_PATTERN } from '../auth/developer-access'

function verifiedAuthOrigin(value: string) {
  const normalized = value.replace(/\/$/, '')
  const url = new URL(normalized)
  if (
    url.protocol !== 'https:' ||
    url.origin !== normalized ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid Auth origin')
  }
  return url.origin
}

@Injectable()
export class AuthDirectoryService {
  async getExistingVerifiedIdentity(authUserId: string) {
    try {
      const env = readApiEnv(process.env)
      if (!UUID_PATTERN.test(authUserId) || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new BadGatewayException('Identity directory is unavailable.')
      }
      const client = createClient(
        verifiedAuthOrigin(env.SUPABASE_URL),
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
          global: {
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                redirect: 'error',
                signal: AbortSignal.timeout(10_000),
              }),
          },
        },
      )
      const { data, error } = await client.auth.admin.getUserById(authUserId)
      const email = data.user?.email?.trim().toLowerCase()
      if (
        error ||
        !data.user ||
        data.user.id !== authUserId ||
        !email ||
        !data.user.email_confirmed_at
      ) {
        throw new BadGatewayException('The existing verified identity could not be confirmed.')
      }
      return { id: data.user.id, email }
    } catch (error) {
      if (error instanceof BadGatewayException) throw error
      throw new BadGatewayException('Identity directory is unavailable.')
    }
  }
}
