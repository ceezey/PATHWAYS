import { webEnv, webSupabasePublishableKey } from '@/lib/env'
import { type Session, type SupabaseClient, createClient } from '@supabase/supabase-js'

export const createPasswordAuthClient = (): SupabaseClient => {
  if (!webEnv.NEXT_PUBLIC_SUPABASE_URL || !webSupabasePublishableKey) throw new Error('unavailable')
  // Isolated memory only. A singleton account switch cannot redirect this mutation.
  return createClient(webEnv.NEXT_PUBLIC_SUPABASE_URL, webSupabasePublishableKey, {
    auth: {
      storageKey: 'pathways-password-verification',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export function currentContinuation(isCurrent: () => boolean) {
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('stale')
  }
  const step = async <T>(work: () => Promise<T>) => {
    assertCurrent()
    const result = await work()
    assertCurrent()
    return result
  }
  return { assertCurrent, step }
}

export async function bindPasswordSession(
  client: SupabaseClient,
  session: Session,
  isCurrent: () => boolean,
) {
  const { step } = currentContinuation(isCurrent)
  const bound = await step(() =>
    client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  )
  if (bound.error || bound.data.user?.id !== session.user.id) throw new Error('verification')
  const current = await step(() => client.auth.getUser())
  if (current.error || current.data.user?.id !== session.user.id) throw new Error('verification')
}
