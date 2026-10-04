import type { AnchorHTMLAttributes } from 'react'

declare global {
  interface Window {
    __PASSWORD_LOGIN_CONFIGURED__?: boolean
    __PASSWORD_LOGIN_NAVIGATION__?: string
    __PASSWORD_LOGIN_SESSION_STATUS__?: 'authenticated' | 'unauthenticated'
  }
}

const syntheticSession = {
  access_token: 'synthetic-access-token',
  user: { id: 'synthetic-user' },
}

export const useSession = () => ({
  configured: window.__PASSWORD_LOGIN_CONFIGURED__ ?? true,
  refreshSession: async () => syntheticSession as never,
  status: window.__PASSWORD_LOGIN_SESSION_STATUS__ ?? 'unauthenticated',
})

export const webEnv = { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' }

export const getBrowserSupabaseClient = () => {
  if (window.__PASSWORD_LOGIN_CONFIGURED__ === false) return null
  return {
    auth: { setSession: async () => ({ data: { session: syntheticSession }, error: null }) },
  } as never
}

export const useRouter = () => ({
  replace: (path: string) => {
    window.__PASSWORD_LOGIN_NAVIGATION__ = path
  },
})

export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />
}
