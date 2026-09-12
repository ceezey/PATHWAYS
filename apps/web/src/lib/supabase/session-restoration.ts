import type { Session, SupabaseClient } from '@supabase/supabase-js'

type RestorableAuth = Pick<SupabaseClient['auth'], 'getSession' | 'getUser'>

export async function validateRestoredSession(auth: RestorableAuth): Promise<Session | null> {
  try {
    // getUser performs online Auth validation. Read the local session only after
    // that succeeds so cookie content alone never marks the UI authenticated.
    const userResult = await auth.getUser()
    if (userResult.error || !userResult.data.user) return null

    const sessionResult = await auth.getSession()
    const session = sessionResult.error ? null : sessionResult.data.session
    if (!session || session.user.id !== userResult.data.user.id) return null
    return session
  } catch {
    return null
  }
}
