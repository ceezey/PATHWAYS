// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  beneficiaryAccessChangedEvent,
  beneficiaryAccessStorageKey,
  clearBeneficiaryAccess,
  hasActiveBeneficiaryAccess,
  writeBeneficiaryAccess,
} from './beneficiary-step-up'

afterEach(() => {
  vi.useRealTimers()
  window.sessionStorage.clear()
})

describe('beneficiary step-up state', () => {
  it('keeps access role-scoped and clears it when another role attempts reuse', () => {
    writeBeneficiaryAccess('Project Manager', new Date(Date.now() + 60_000).toISOString())

    expect(hasActiveBeneficiaryAccess('Project Manager')).toBe(true)
    expect(hasActiveBeneficiaryAccess('Project Officer')).toBe(false)
    expect(window.sessionStorage.getItem(beneficiaryAccessStorageKey)).toBeNull()
  })

  it('expires access and notifies the route guard after explicit relock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T00:00:00.000Z'))
    const listener = vi.fn()
    window.addEventListener(beneficiaryAccessChangedEvent, listener)

    writeBeneficiaryAccess('Project Manager', '2026-09-13T00:00:01.000Z')
    expect(hasActiveBeneficiaryAccess('Project Manager')).toBe(true)
    vi.advanceTimersByTime(1_001)
    expect(hasActiveBeneficiaryAccess('Project Manager')).toBe(false)

    writeBeneficiaryAccess('Project Manager', '2026-09-13T00:01:00.000Z')
    clearBeneficiaryAccess()
    expect(listener).toHaveBeenCalled()
    expect(window.sessionStorage.getItem(beneficiaryAccessStorageKey)).toBeNull()
    window.removeEventListener(beneficiaryAccessChangedEvent, listener)
  })
})
