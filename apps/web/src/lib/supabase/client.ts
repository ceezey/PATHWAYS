import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import { webEnv, webSupabasePublishableKey } from '@/lib/env'

let browserClient: SupabaseClient | null | undefined

export const getBrowserSupabaseClient = (): SupabaseClient | null => {
  if (browserClient !== undefined) {
    return browserClient
  }

  if (!webEnv.NEXT_PUBLIC_SUPABASE_URL || !webSupabasePublishableKey) {
    browserClient = null
    return browserClient
  }

  browserClient = createClient(webEnv.NEXT_PUBLIC_SUPABASE_URL, webSupabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return browserClient
}
