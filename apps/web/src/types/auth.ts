import type { Session } from '@supabase/supabase-js'

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface SessionContextValue {
  session: Session | null
  status: SessionStatus
  configured: boolean
  isBypassed: boolean
  email: string | null
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}
