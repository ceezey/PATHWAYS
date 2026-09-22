import { creatableRoles } from './permissions'
import {
  DEMO_PASSWORD,
  type DemoAccount,
  type DemoState,
  appendAudit,
  commitDemo,
  currentAccount,
  demoPolicy,
  demoTime,
  getDemoState,
  nextId,
  notifyLocally,
  transactDemo,
} from './store'

export const passwordError = (password: string) =>
  password.length < demoPolicy.passwordMin ||
  password.length > demoPolicy.passwordMax ||
  !/[A-Z]/.test(password) ||
  !/[a-z]/.test(password) ||
  !/\d/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
    ? 'Use 12–64 characters, including uppercase, lowercase, a number and a symbol.'
    : null

export function loginDemo(identifier: string, password: string) {
  const state = structuredClone(getDemoState())
  if (state.scenario === 'login-unavailable')
    throw new Error('The sign-in service is unavailable. Try again later.')
  const account = state.accounts.find((a) =>
    [a.email.toLowerCase(), a.username.toLowerCase()].includes(identifier.trim().toLowerCase()),
  )
  let error = ''
  if (!account) error = 'The email or password is incorrect.'
  else if (account.status !== 'Active') error = 'This account is inactive or not yet authorized.'
  else if (account.locked)
    error = 'This account is locked. Request a password reset to regain access.'
  else if (account.password !== password) {
    account.failedAttempts += 1
    account.locked = account.failedAttempts >= demoPolicy.failedLoginLimit
    error = account.locked
      ? 'Five failed attempts. Your account is locked; reset your password.'
      : 'The email or password is incorrect.'
  }
  if (error) {
    appendAudit(
      state,
      { action: 'login', module: 'accounts', outcome: 'Denied', details: error },
      account,
    )
    commitDemo(state)
    throw new Error(error)
  }
  const valid = account as DemoAccount
  valid.failedAttempts = 0
  state.session = { accountId: valid.id, signedInAt: demoTime(state) }
  appendAudit(
    state,
    {
      action: 'login',
      module: 'accounts',
      outcome: 'Success',
      details: 'Staff session created.',
    },
    valid,
  )
  commitDemo(state)
  return valid
}

export const recoveryResponse =
  'If an active account matches that address, recovery instructions are available in the recovery inbox.'
export function requestDemoReset(email: string) {
  const state = structuredClone(getDemoState())
  const account = state.accounts.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.status === 'Active',
  )
  if (account) {
    const token = {
      id: nextId(state, 'reset'),
      accountId: account.id,
      expiresAt: state.clock + demoPolicy.resetMinutes * 60000,
      used: false,
    }
    state.resetTokens.push(token)
    notifyLocally(
      state,
      account,
      'Reset your PATHWAYS password. This link expires in 15 minutes and can be used once.',
      `/staff/reset-password?token=${token.id}`,
    )
    appendAudit(
      state,
      {
        action: 'reset.request',
        module: 'accounts',
        outcome: 'Success',
        details: 'Password recovery link issued.',
      },
      account,
    )
    commitDemo(state)
  }
  return recoveryResponse
}
export function resetTokenState(
  id: string | null,
  state = getDemoState(),
): 'valid' | 'invalid' | 'expired' | 'used' {
  const token = state.resetTokens.find((t) => t.id === id)
  if (!token) return 'invalid'
  if (token.used) return 'used'
  return token.expiresAt <= state.clock ? 'expired' : 'valid'
}
export function resetDemoPassword(id: string, password: string, confirmation: string) {
  const state = structuredClone(getDemoState())
  const status = resetTokenState(id, state)
  if (status !== 'valid') throw new Error(`This reset link is ${status}. Request a new link.`)
  const issue = passwordError(password)
  if (issue) throw new Error(issue)
  if (password !== confirmation) throw new Error('Passwords must match.')
  const token = state.resetTokens.find((t) => t.id === id)
  if (!token) throw new Error('This reset link is invalid. Request a new link.')
  const account = state.accounts.find((a) => a.id === token.accountId)
  if (!account || account.status !== 'Active') throw new Error('This account is no longer active.')
  account.password = password
  account.locked = false
  account.failedAttempts = 0
  for (const resetToken of state.resetTokens) {
    if (resetToken.accountId === account.id) resetToken.used = true
  }
  if (state.session?.accountId === account.id) state.session = null
  appendAudit(
    state,
    {
      action: 'password.reset',
      module: 'accounts',
      outcome: 'Success',
      details: 'Password changed; recovery links invalidated.',
    },
    account,
  )
  commitDemo(state)
}

function validateProfile(
  input: Pick<DemoAccount, 'name' | 'email' | 'contact'>,
  state: DemoState,
  id?: string,
) {
  if (!input.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    throw new Error('Enter a name and valid email address.')
  if (input.contact && !/^\+?[\d ()-]{7,20}$/.test(input.contact))
    throw new Error('Enter a valid contact number.')
  if (
    state.accounts.some(
      (a) => a.id !== id && a.email.toLowerCase() === input.email.trim().toLowerCase(),
    )
  )
    throw new Error('This email is already registered. Choose another email.')
}
export function updateDemoProfile(input: Pick<DemoAccount, 'name' | 'email' | 'contact'>) {
  return transactDemo('profile.edit', undefined, currentAccount()?.id, (state, actor) => {
    validateProfile(input, state, actor.id)
    Object.assign(actor, {
      ...input,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
    })
  })
}
export function changeDemoPassword(current: string, password: string, confirmation: string) {
  return transactDemo('profile.edit', undefined, currentAccount()?.id, (_state, actor) => {
    if (actor.password !== current) throw new Error('Current password is incorrect.')
    const issue = passwordError(password)
    if (issue) throw new Error(issue)
    if (password !== confirmation) throw new Error('Passwords must match.')
    actor.password = password
  })
}
export function managedDemoAccounts(state = getDemoState()) {
  const actor = currentAccount(state)
  if (!actor) return []
  const roles = creatableRoles(actor.role)
  return state.accounts.filter(
    (a) =>
      roles.includes(a.role) &&
      (actor.role === 'System Administrator' ||
        (a.projectIds.length > 0 && a.projectIds.every((id) => actor.projectIds.includes(id)))),
  )
}
export function saveDemoAccount(
  input: Pick<DemoAccount, 'name' | 'email' | 'role' | 'projectIds'>,
  id?: string,
) {
  return transactDemo(id ? 'users.edit' : 'users.create', undefined, id, (state, actor) => {
    if (!creatableRoles(actor.role).includes(input.role))
      throw new Error('This role is outside your account-creation authority.')
    const existing = id ? managedDemoAccounts(state).find((a) => a.id === id) : undefined
    if (id && !existing) throw new Error('This account is outside your management scope.')
    if (
      !input.projectIds.length ||
      input.projectIds.some(
        (pid) => !actor.projectIds.includes(pid) || !state.projects.some((p) => p.id === pid),
      )
    )
      throw new Error('Select available projects within your authorized scope.')
    validateProfile({ ...input, contact: '' }, state, id)
    const account: DemoAccount = existing ?? {
      id: nextId(state, 'account'),
      name: '',
      email: '',
      role: input.role,
      username: input.email,
      password: DEMO_PASSWORD,
      contact: '',
      projectIds: [],
      status: 'Invited',
      locked: false,
      failedAttempts: 0,
    }
    Object.assign(account, input)
    if (!existing) {
      state.accounts.push(account)
      notifyLocally(
        state,
        account,
        `Your account has been created and awaits authorization. Temporary password: ${DEMO_PASSWORD}`,
      )
    }
    return account.id
  })
}
export function authorizeDemoAccount(id: string) {
  return transactDemo('users.authorize', undefined, id, (state) => {
    const account = managedDemoAccounts(state).find((a) => a.id === id)
    if (!account) throw new Error('This account is outside your management scope.')
    account.status = 'Active'
    notifyLocally(state, account, 'Your PATHWAYS account is authorized and active.')
  })
}
export function deactivateDemoAccount(id: string) {
  return transactDemo('users.deactivate', undefined, id, (state) => {
    const account = managedDemoAccounts(state).find((a) => a.id === id)
    if (!account) throw new Error('This account is outside your management scope.')
    if (
      account.role === 'System Administrator' &&
      state.accounts.filter((a) => a.role === account.role && a.status === 'Active').length <= 1
    )
      throw new Error('The last active administrator cannot be deactivated.')
    account.status = 'Deactivated'
    if (state.session?.accountId === id) state.session = null
  })
}
