import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { webEnv, webSupabasePublishableKey } from '@/lib/env'

let browserClient: SupabaseClient | null | undefined

export const getBrowserSupabaseClient = (): SupabaseClient | null => {
  const configuredSupabaseUrl = (webEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  if (browserClient !== undefined) {
    return browserClient
  }

  if (!configuredSupabaseUrl || !webSupabasePublishableKey) {
    browserClient = null
    return browserClient
  }

  // The browser and middleware must share cookie-backed sessions. Do not copy old
  // localStorage tokens; sign in again after this change.
  browserClient = createBrowserClient(webEnv.NEXT_PUBLIC_SUPABASE_URL, webSupabasePublishableKey)

  return browserClient
}
