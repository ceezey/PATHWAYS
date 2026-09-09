// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authorizeDemoAccount,
  deactivateDemoAccount,
  loginDemo,
  managedDemoAccounts,
  requestDemoReset,
  resetDemoPassword,
  resetTokenState,
  saveDemoAccount,
  updateDemoProfile,
} from './accounts'
import { actionRoles, assertAction, hasAction } from './permissions'
import {
  DEMO_KEY,
  DEMO_PASSWORD,
  advanceDemoClock,
  commitDemo,
  createDemoBaseline,
  currentAccount,
  getDemoState,
  recordDemoAccess,
  resetDemo,
  setDemoScenario,
  subscribeDemo,
  switchDemoAccount,
  transactDemo,
} from './store'

beforeEach(() => {
  localStorage.clear()
  resetDemo()
})
describe('I01 shared demo contract', () => {
  it('has a deterministic baseline and persists one versioned state', () => {
    expect(createDemoBaseline()).toEqual(createDemoBaseline())
    switchDemoAccount('project-manager')
    expect(JSON.parse(localStorage.getItem(DEMO_KEY) ?? '{}').session.accountId).toBe(
      'project-manager',
    )
    expect(currentAccount()?.projectIds).toEqual(['futuremakers-ncr'])
    resetDemo()
    expect(getDemoState()).toEqual(createDemoBaseline())
  })
  it('repairs the Project Manager FutureMakers scope in snapshots affected by team editing', () => {
    const affected = structuredClone(createDemoBaseline()) as Record<string, unknown>
    const accounts = affected.accounts as ReturnType<typeof createDemoBaseline>['accounts']
    const manager = accounts.find((account) => account.id === 'project-manager')
    expect(manager).toBeDefined()
    if (!manager) throw new Error('Project Manager fixture is missing.')
    manager.projectIds = manager.projectIds.filter((id) => id !== 'futuremakers-ncr')
    affected.teamScopeVersion = undefined
    localStorage.setItem(DEMO_KEY, JSON.stringify(affected))

    expect(
      getDemoState().accounts.find((account) => account.id === 'project-manager')?.projectIds,
    ).toContain('futuremakers-ncr')
  })
  it('notifies subscribers once per commit and detaches cleanly', () => {
    const listener = vi.fn()
    const remove = subscribeDemo(listener)
    switchDemoAccount('project-manager')
    expect(listener).toHaveBeenCalledTimes(1)
    remove()
    resetDemo()
    expect(listener).toHaveBeenCalledTimes(1)
  })
  it('checks every action against its explicit actor list', () => {
    for (const [action, roles] of Object.entries(actionRoles)) {
      for (const account of getDemoState().accounts) {
        expect(hasAction(account.role, action as keyof typeof actionRoles)).toBe(
          (roles as string[]).includes(account.role),
        )
      }
    }
    expect(hasAction('System Administrator', 'outcomes.log')).toBe(false)
    expect(hasAction('Monitoring and Evaluation Officer', 'alerts.review')).toBe(true)
    expect(hasAction('Project Manager', 'indicators.manage')).toBe(false)
  })
  it('rejects inactive actors and out-of-scope projects before mutation', () => {
    switchDemoAccount('project-manager')
    const before = structuredClone(getDemoState().projects)
    expect(() =>
      transactDemo('projects.edit', 'youth-rise-western-samar', undefined, (s) => {
        s.projects = []
      }),
    ).toThrow('scope')
    expect(getDemoState().projects).toEqual(before)
    const actor = currentAccount()
    expect(actor).toBeDefined()
    if (!actor) throw new Error('Project Manager fixture was not selected.')
    expect(() => assertAction({ ...actor, status: 'Deactivated' }, 'projects.edit')).toThrow(
      'permission',
    )
  })
  it('abandons staged mutation on failure but logs the failed event', () => {
    switchDemoAccount('system-administrator')
    expect(() =>
      transactDemo('users.edit', undefined, undefined, (s) => {
        s.accounts = []
        throw new Error('fixture failure')
      }),
    ).toThrow('fixture failure')
    expect(getDemoState().accounts).toHaveLength(6)
    expect(getDemoState().audits.at(-1)?.outcome).toBe('Failure')
  })
  it('does not publish in-memory changes when browser persistence fails', () => {
    const before = getDemoState()
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    expect(() => commitDemo({ ...before, revision: 999 })).toThrow('Quota')
    expect(getDemoState().revision).toBe(before.revision)
    write.mockRestore()
  })
  it('records read-only access outcomes without incrementing the domain revision', () => {
    switchDemoAccount('project-manager')
    const revision = getDemoState().revision
    recordDemoAccess('monitoring.view', 'Opened the connected monitoring summary.')
    expect(getDemoState().revision).toBe(revision)
    expect(getDemoState().audits.at(-1)).toMatchObject({
      action: 'monitoring.view',
      outcome: 'Success',
    })
  })
})
describe('I02 local credential and scoped account flows', () => {
  it('locks on the fifth consecutive invalid credential and resets with a one-use link', () => {
    for (let i = 0; i < 5; i++) expect(() => loginDemo('project.officer', 'wrong')).toThrow()
    expect(() => loginDemo('project.officer', DEMO_PASSWORD)).toThrow('locked')
    requestDemoReset('project.officer@demo.pathways.local')
    const id = getDemoState().resetTokens[0].id
    expect(() => resetDemoPassword(id, 'weak', 'weak')).toThrow('12')
    resetDemoPassword(id, 'NewPassword!123', 'NewPassword!123')
    expect(resetTokenState(id)).toBe('used')
    expect(() => resetDemoPassword(id, 'OtherPassword!123', 'OtherPassword!123')).toThrow('used')
    expect(loginDemo('project.officer', 'NewPassword!123').role).toBe('Project Officer')
  })
  it('gives generic recovery response and enforces expiry with a reissue path', () => {
    expect(requestDemoReset('unknown@demo.pathways.local')).toBe(
      requestDemoReset('project.officer@demo.pathways.local'),
    )
    const token = getDemoState().resetTokens[0]
    advanceDemoClock(16)
    expect(resetTokenState(token.id)).toBe('expired')
    requestDemoReset('project.officer@demo.pathways.local')
    expect(resetTokenState(getDemoState().resetTokens[1].id)).toBe('valid')
  })
  it('distinguishes outage and inactive accounts', () => {
    setDemoScenario('login-unavailable')
    expect(() => loginDemo('project.officer', DEMO_PASSWORD)).toThrow('connection')
    setDemoScenario('baseline')
    switchDemoAccount('project-manager')
    deactivateDemoAccount('project-officer')
    expect(() => loginDemo('project.officer', DEMO_PASSWORD)).toThrow('inactive')
  })
  it('requires authorization before a newly created scoped user can sign in', () => {
    switchDemoAccount('project-manager')
    const id = saveDemoAccount({
      name: 'Fictional Officer',
      email: 'fictional@demo.pathways.local',
      role: 'Project Officer',
      projectIds: ['futuremakers-ncr'],
    })
    expect(() => loginDemo('fictional@demo.pathways.local', DEMO_PASSWORD)).toThrow('authorized')
    authorizeDemoAccount(id)
    expect(loginDemo('fictional@demo.pathways.local', DEMO_PASSWORD).projectIds).toEqual([
      'futuremakers-ncr',
    ])
    expect(getDemoState().notifications.some((n) => n.recipientId === id)).toBe(true)
  })
  it('separates unauthorized role, scope, duplicate email and last-admin errors', () => {
    switchDemoAccount('project-manager')
    const input = {
      name: 'Fictional Officer',
      email: 'another@demo.pathways.local',
      role: 'Project Officer' as const,
      projectIds: ['futuremakers-ncr'],
    }
    expect(() => saveDemoAccount({ ...input, role: 'Grant Manager' })).toThrow('authority')
    expect(() => saveDemoAccount({ ...input, projectIds: ['youth-rise-western-samar'] })).toThrow(
      'scope',
    )
    expect(() =>
      saveDemoAccount({ ...input, email: 'project.officer@demo.pathways.local' }),
    ).toThrow('already')
    expect(managedDemoAccounts().some((a) => a.role === 'System Administrator')).toBe(false)
    switchDemoAccount('system-administrator')
    expect(() => deactivateDemoAccount('system-administrator')).toThrow('last active')
  })
  it('profile email changes affect local sign-in immediately', () => {
    switchDemoAccount('project-officer')
    updateDemoProfile({
      name: 'Fictional Revised Name',
      email: 'revised@demo.pathways.local',
      contact: '09171234567',
    })
    expect(() => loginDemo('project.officer@demo.pathways.local', DEMO_PASSWORD)).toThrow(
      'incorrect',
    )
    expect(loginDemo('revised@demo.pathways.local', DEMO_PASSWORD).name).toBe(
      'Fictional Revised Name',
    )
  })
})
