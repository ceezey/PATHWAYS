import type { AnchorHTMLAttributes } from 'react'

// Isolated browser-component fixture only. No real authentication or provider calls.
const session = {
  access_token: 'component-fixture-not-a-real-token',
  user: { id: '56ad4c1a-113f-401b-84e8-1d2135f174c1' },
}
const client = {}
export const useSession = () => ({
  session,
  status: 'authenticated',
  configured: true,
  refreshSession: async () => undefined,
  signOut: async () => undefined,
})
export const getBrowserSupabaseClient = () => client
export const webEnv = { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' }
export const useRouter = () => ({ replace: () => undefined })
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />
}
