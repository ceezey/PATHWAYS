import type { ApplicationProfile } from '@/features/auth/auth-access'
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSensitiveDraftStorage,
  readSensitiveDraft,
  sensitiveDraftGeneration,
  sensitiveDraftKey,
  useSensitiveDraftOwner,
  writeSensitiveDraft,
} from './sensitive-drafts'

const state = vi.hoisted(() => ({
  profile: {
    organizationId: 'org-a',
    userId: 'user-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['activities.create'],
    assignedProjectIds: ['project-a'],
  },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: state.profile }) }))
const scope = {
  organizationId: 'org-a',
  userId: 'user-a',
  projectId: 'project-a',
  resourceId: null,
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
})
describe('sensitive drafts', () => {
  it('separates actor, organization, project and tagged new-resource identities', () => {
    const key = sensitiveDraftKey('activity', scope)
    const alternatives = [
      { ...scope, userId: 'user-b' },
      { ...scope, organizationId: 'org-b' },
      { ...scope, projectId: 'project-b' },
      { ...scope, resourceId: 'new-resource' },
    ]
    for (const candidate of alternatives)
      expect(sensitiveDraftKey('activity', candidate)).not.toBe(key)
    writeSensitiveDraft(key, { note: 'synthetic' }, sensitiveDraftGeneration())
    expect(readSensitiveDraft(key)).toEqual({ note: 'synthetic' })
    for (const candidate of alternatives)
      expect(readSensitiveDraft(sensitiveDraftKey('activity', candidate))).toBeNull()
  })
  it('invalidates old writers before cleanup and keeps unrelated authentication/storage', () => {
    const owner = sensitiveDraftGeneration()
    const key = sensitiveDraftKey('activity', scope)
    window.sessionStorage.setItem(key, 'private')
    window.sessionStorage.setItem('pathways.beneficiaryDraft', 'legacy')
    window.localStorage.setItem('pathways:direct-entry:a:b', 'old-retry')
    window.sessionStorage.setItem('unrelated', 'keep')
    window.localStorage.setItem('sb-project-auth-token', 'keep')
    clearSensitiveDraftStorage()
    writeSensitiveDraft(key, { note: 'late' }, owner)
    expect(window.sessionStorage.getItem(key)).toBeNull()
    expect(window.sessionStorage.getItem('pathways.beneficiaryDraft')).toBeNull()
    expect(window.localStorage.getItem('pathways:direct-entry:a:b')).toBeNull()
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
    expect(window.localStorage.getItem('sb-project-auth-token')).toBe('keep')
  })
  it('continues after a removal failure and catches unavailable storage getters', () => {
    window.sessionStorage.setItem('pathways.beneficiaryDraft', 'a')
    window.sessionStorage.setItem('pathways.projectSetupDraft', 'b')
    const original = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      if (key === 'pathways.beneficiaryDraft') throw Error('blocked')
      original.call(this, key)
    })
    expect(() => clearSensitiveDraftStorage()).not.toThrow()
    expect(window.sessionStorage.getItem('pathways.projectSetupDraft')).toBeNull()
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw Error('blocked')
    })
    expect(() => clearSensitiveDraftStorage()).not.toThrow()
    expect(readSensitiveDraft('any')).toBeNull()
  })
  it('invalidates a captured owner immediately when permission or assignment changes', () => {
    const captured: Array<NonNullable<ReturnType<typeof useSensitiveDraftOwner>>> = []
    function Probe() {
      const owner = useSensitiveDraftOwner(
        state.profile as ApplicationProfile,
        'activity',
        'activities.create',
        'project-a',
        null,
      )
      if (owner) captured.push(owner)
      return createElement('output', null, owner ? 'ready' : 'blocked')
    }
    const view = render(createElement(Probe))
    const first = captured[0]
    state.profile = { ...state.profile, assignedProjectIds: [] }
    view.rerender(createElement(Probe))
    expect(screen.getByText('blocked')).toBeTruthy()
    expect(first.isCurrent()).toBe(false)
    state.profile = { ...state.profile, assignedProjectIds: ['project-a'] }
    view.rerender(createElement(Probe))
    const reauthorized = captured[captured.length - 1]
    state.profile = { ...state.profile, permissions: [] }
    view.rerender(createElement(Probe))
    expect(reauthorized.isCurrent()).toBe(false)
    state.profile = { ...state.profile, permissions: ['activities.create'] }
  })
})

describe('storage enumeration failure isolation', () => {
  it('invalidates writers when storage length throws and still cleans the other store', () => {
    const before = sensitiveDraftGeneration()
    window.localStorage.setItem('pathways.beneficiaryDraft', 'local')
    window.localStorage.setItem('unrelated', 'keep')
    const length = Object.getOwnPropertyDescriptor(Storage.prototype, 'length')?.get
    vi.spyOn(Storage.prototype, 'length', 'get').mockImplementation(function (this: Storage) {
      if (this === window.sessionStorage) throw Error('length blocked')
      return length?.call(this) ?? 0
    })
    expect(() => clearSensitiveDraftStorage()).not.toThrow()
    expect(sensitiveDraftGeneration()).toBe(before + 1)
    expect(window.localStorage.getItem('pathways.beneficiaryDraft')).toBeNull()
    expect(window.localStorage.getItem('unrelated')).toBe('keep')
  })
  it('continues partial enumeration after a key failure without deleting unrelated storage', () => {
    const first = sensitiveDraftKey('activity', scope)
    const second = sensitiveDraftKey('project', scope)
    window.sessionStorage.setItem(first, 'first')
    window.sessionStorage.setItem('unrelated', 'keep')
    window.sessionStorage.setItem(second, 'second')
    const original = Storage.prototype.key
    vi.spyOn(Storage.prototype, 'key').mockImplementation(function (this: Storage, index: number) {
      if (this === window.sessionStorage && index === 1) throw Error('partial failure')
      return original.call(this, index)
    })
    const before = sensitiveDraftGeneration()
    expect(() => clearSensitiveDraftStorage()).not.toThrow()
    expect(sensitiveDraftGeneration()).toBe(before + 1)
    expect(window.sessionStorage.getItem(first)).toBeNull()
    expect(window.sessionStorage.getItem(second)).toBeNull()
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
  })
})
