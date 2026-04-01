import { createBrowserClient } from '@supabase/ssr'

import { webEnv, webSupabasePublishableKey } from '@/lib/env'

export function createClient() {
  if (!webEnv.NEXT_PUBLIC_SUPABASE_URL || !webSupabasePublishableKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and a Supabase publishable key.')
  }

  return createBrowserClient(webEnv.NEXT_PUBLIC_SUPABASE_URL, webSupabasePublishableKey)
}
