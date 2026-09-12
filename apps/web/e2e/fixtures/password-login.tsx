import type { AnchorHTMLAttributes } from 'react'

type LoginMode = 'pending-success' | 'rejected' | 'network' | 'success'

declare global {
  interface Window {
    __PASSWORD_LOGIN_CONFIGURED__?: boolean
    __PASSWORD_LOGIN_COUNT__?: number
    __PASSWORD_LOGIN_EMAIL__?: string
    __PASSWORD_LOGIN_MODE__?: LoginMode
    __PASSWORD_LOGIN_NAVIGATION__?: string
    __PASSWORD_LOGIN_RELEASE__?: () => void
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

export const getBrowserSupabaseClient = () => {
  if (window.__PASSWORD_LOGIN_CONFIGURED__ === false) return null
  return {
    auth: {
      signInWithPassword: async ({ email }: { email: string; password: string }) => {
        window.__PASSWORD_LOGIN_COUNT__ = (window.__PASSWORD_LOGIN_COUNT__ ?? 0) + 1
        window.__PASSWORD_LOGIN_EMAIL__ = email
        if (window.__PASSWORD_LOGIN_MODE__ === 'pending-success') {
          await new Promise<void>((resolve) => {
            window.__PASSWORD_LOGIN_RELEASE__ = resolve
          })
        }
        if (window.__PASSWORD_LOGIN_MODE__ === 'network') {
          throw new Error('private-network-detail')
        }
        if (window.__PASSWORD_LOGIN_MODE__ === 'rejected') {
          return {
            data: { session: null },
            error: { message: 'private-provider-detail', status: 400 },
          }
        }
        return { data: { session: syntheticSession }, error: null }
      },
    },
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
