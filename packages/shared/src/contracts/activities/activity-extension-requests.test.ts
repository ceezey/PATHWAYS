import { describe, expect, it } from 'vitest'

import {
  createActivityExtensionRequest,
  decideActivityExtensionRequest,
  verifyActivityExtensionRequest,
} from './activity-extension-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const instant = '2026-09-24T00:00:00.000Z'
const note = 'A note of ten or more characters.'
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('activity extension request contracts', () => {
  const create = { clientMutationId: uuid, requestedEndDate: '2026-12-31', reason: note }

  it('takes a plain calendar day for the requested end date and no other date form', () => {
    expect(accepts(createActivityExtensionRequest, create)).toBe(true)
    for (const requestedEndDate of [
      '2026-02-30',
      '2026-12-31T00:00:00Z',
      '20261231',
      '2026-W53',
      '',
    ])
      expect(accepts(createActivityExtensionRequest, { ...create, requestedEndDate })).toBe(false)
  })

  it('checks the reason length and refuses unknown keys', () => {
    expect(accepts(createActivityExtensionRequest, { ...create, reason: 'too short' })).toBe(false)
    expect(accepts(createActivityExtensionRequest, { ...create, reason: 'x'.repeat(2001) })).toBe(
      false,
    )
    expect(accepts(createActivityExtensionRequest, { ...create, extra: true })).toBe(false)
  })

  it('verifies with a decision, a note and a real-day version', () => {
    const verify = { decision: 'VERIFY', note, expectedUpdatedAt: instant }
    expect(accepts(verifyActivityExtensionRequest, verify)).toBe(true)
    expect(accepts(verifyActivityExtensionRequest, { ...verify, decision: 'APPROVE' })).toBe(false)
    expect(
      accepts(verifyActivityExtensionRequest, { ...verify, expectedUpdatedAt: '2026-02-30' }),
    ).toBe(false)
  })

  it('decides with both versions and takes only approve or decline', () => {
    const decide = {
      clientMutationId: uuid,
      decision: 'APPROVE',
      note,
      expectedUpdatedAt: instant,
      activityExpectedUpdatedAt: instant,
    }
    expect(accepts(decideActivityExtensionRequest, decide)).toBe(true)
    expect(accepts(decideActivityExtensionRequest, { ...decide, decision: 'VERIFY' })).toBe(false)
    expect(
      accepts(decideActivityExtensionRequest, { ...decide, activityExpectedUpdatedAt: undefined }),
    ).toBe(false)
  })
})
