import { type AnchorHTMLAttributes, useSyncExternalStore } from 'react'

// Isolated browser-component fixture only; never exported by application routes.
const initialSession = {
  access_token: 'component-fixture-not-a-real-token',
  user: { id: '56ad4c1a-113f-401b-84e8-1d2135f174c1' },
}
let state: { session: typeof initialSession | null; path: string; formRevision: number } = {
  session: initialSession,
  path: '/auth/mfa',
  formRevision: 0,
}
const listeners = new Set<() => void>()
const publish = () => {
  for (const listener of listeners) listener()
}
window.addEventListener('fixture-state', (event) => {
  const detail = (event as CustomEvent).detail
  state = {
    session: detail.logout ? null : (detail.session ?? state.session),
    path: detail.path ?? state.path,
    formRevision: state.formRevision + (detail.remount ? 1 : 0),
  }
  publish()
})
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const snapshot = () => state
const client = {
  auth: {
    mfa: {
      listFactors: async () => ({
        error: null,
        data: { all: [{ id: 'synthetic-factor', status: 'verified', factor_type: 'totp' }] },
      }),
    },
  },
}
export const useSession = () => {
  const value = useSyncExternalStore(subscribe, snapshot)
  return {
    session: value.session,
    status: value.session ? 'authenticated' : 'unauthenticated',
    configured: true,
    refreshSession: async () => value.session,
    signOut: async () => {
      state = { ...state, session: null }
      publish()
    },
  }
}
export const usePathname = () => useSyncExternalStore(subscribe, snapshot).path
export const useFormRevision = () => useSyncExternalStore(subscribe, snapshot).formRevision
export const getBrowserSupabaseClient = () => client
export const webEnv = { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' }
const router = {
  replace: (path: string) => {
    // Record the requested fixed path without performing a real navigation.
    const record = document.createElement('meta')
    record.name = 'fixture-navigation'
    record.content = path
    document.head.append(record)
  },
}
export const useRouter = () => router
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />
}
