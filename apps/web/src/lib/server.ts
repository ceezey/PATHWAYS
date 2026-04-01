import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { webEnv, webSupabasePublishableKey } from '@/lib/env'

/**
 * If using Fluid compute: Don't put this client in a global variable. Always create a new client within each
 * function when using it.
 */
export async function createClient() {
  if (!webEnv.NEXT_PUBLIC_SUPABASE_URL || !webSupabasePublishableKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and a Supabase publishable key.')
  }

  const cookieStore = await cookies()

  return createServerClient(webEnv.NEXT_PUBLIC_SUPABASE_URL, webSupabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}
