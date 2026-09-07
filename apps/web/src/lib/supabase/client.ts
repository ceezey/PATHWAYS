import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { developerSupabaseUrl } from '@/features/auth/auth-access'
import { webEnv, webSupabasePublishableKey } from '@/lib/env'

let browserClient: SupabaseClient | null | undefined

export const getBrowserSupabaseClient = (): SupabaseClient | null => {
  if (browserClient !== undefined) {
    return browserClient
  }

  if (webEnv.NEXT_PUBLIC_SUPABASE_URL !== developerSupabaseUrl || !webSupabasePublishableKey) {
    browserClient = null
    return browserClient
  }

  // The browser and middleware must share cookie-backed sessions. Do not copy old
  // localStorage tokens; sign in again after this change.
  browserClient = createBrowserClient(webEnv.NEXT_PUBLIC_SUPABASE_URL, webSupabasePublishableKey)

  return browserClient
}
