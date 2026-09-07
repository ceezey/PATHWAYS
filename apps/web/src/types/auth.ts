import type { Session } from '@supabase/supabase-js'

import type { PrototypeRole } from '@/types/prototype-role'

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface PrototypeSession {
  contactNumber?: string
  email: string
  displayName: string
  role: PrototypeRole
  signedInAt: string
}

export interface SessionContextValue {
  session: Session | null
  prototypeSession: PrototypeSession | null
  status: SessionStatus
  configured: boolean
  isBypassed: boolean
  isPrototypeSession: boolean
  prototypeModeEnabled: boolean
  email: string | null
  refreshSession: () => Promise<void>
  signInWithPrototype: (session: PrototypeSession) => Promise<void>
  updatePrototypeProfile: (
    profile: Pick<PrototypeSession, 'contactNumber' | 'displayName' | 'email'>,
  ) => Promise<boolean>
  signOut: () => Promise<void>
}
