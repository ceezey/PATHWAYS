import { type AnchorHTMLAttributes, useSyncExternalStore } from 'react'
import type { ApplicationProfile } from '../../src/features/auth/auth-access'

// Synthetic, intercepted browser fixture. Not reachable from application routes.
type State = {
  profile: ApplicationProfile | null
  path: string
  token: string | null
  subject: string
  access: string
}
let state: State = {
  profile: null,
  path: '/dashboard',
  token: 'synthetic-token',
  subject: '10000000-0000-4000-8000-000000000001',
  access: 'ready',
}
const listeners = new Set<() => void>()
window.addEventListener('fixture-state', (event) => {
  state = { ...state, ...(event as CustomEvent).detail }
  for (const listener of listeners) listener()
})
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const useState = () => useSyncExternalStore(subscribe, () => state)
export const useSession = () => {
  const current = useState()
  return {
    session: current.token ? { access_token: current.token, user: { id: current.subject } } : null,
    status: current.token ? 'authenticated' : 'unauthenticated',
    configured: true,
  }
}
export const useCurrentRole = () => {
  const current = useState()
  return {
    profile: current.profile,
    role: current.profile ? 'Project Officer' : null,
    assignedProjectIds: current.profile?.assignedProjectIds ?? [],
    access: current.access,
    refreshAccess: () => undefined,
  }
}
export const usePathname = () => useState().path.split('?')[0]
export const useSearchParams = () => new URLSearchParams(useState().path.split('?')[1])
export const useRouter = () => ({ replace: () => undefined })
export const webEnv = { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' }
export default function Link({
  prefetch: _prefetch,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  return <a {...props} />
}
