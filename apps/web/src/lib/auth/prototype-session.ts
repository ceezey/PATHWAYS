import type { PrototypeAccountPublic } from '@/lib/auth/prototype-accounts'
import {
  appendAudit,
  commitDemo,
  currentAccount,
  getDemoState,
  switchDemoAccount,
} from '@/lib/demo-state/store'
import type { PrototypeSession } from '@/types/auth'

export const createPrototypeSession = (account: PrototypeAccountPublic): PrototypeSession => ({
  email: account.email,
  displayName: account.displayName,
  role: account.role,
  signedInAt: new Date().toISOString(),
})

export const readPrototypeSession = (): PrototypeSession | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const demo = getDemoState()
  const account = currentAccount(demo)
  if (account && account.status === 'Active' && demo.session) {
    return {
      email: account.email,
      displayName: account.name,
      role: account.role,
      contactNumber: account.contact,
      signedInAt: demo.session.signedInAt,
    }
  }
  return null
}

export const writePrototypeSession = (session: PrototypeSession) => {
  if (typeof window === 'undefined') {
    return
  }

  const account = getDemoState().accounts.find(
    (a) => a.email === session.email && a.status === 'Active',
  )
  if (account) switchDemoAccount(account.id)
}

export const clearPrototypeSession = () => {
  if (typeof window === 'undefined') {
    return
  }

  const state = structuredClone(getDemoState())
  appendAudit(state, {
    action: 'logout',
    module: 'accounts',
    outcome: 'Success',
    details: 'Local session ended.',
  })
  state.session = null
  commitDemo(state)
}
