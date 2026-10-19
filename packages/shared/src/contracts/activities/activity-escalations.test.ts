import { describe, expect, it } from 'vitest'

import {
  activityEscalationResponse,
  createActivityEscalation,
  decideActivityEscalation,
} from './activity-escalations'

const uuid = '10000000-0000-4000-8000-000000000001'
const instant = '2026-10-19T00:00:00.000Z'
const note = 'A note of ten or more characters.'
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('activity escalation contracts', () => {
  it('raises with a request id and a 10 to 2000 character reason and nothing else', () => {
    const body = { clientMutationId: uuid, reason: note }
    expect(accepts(createActivityEscalation, body)).toBe(true)
    expect(accepts(createActivityEscalation, { ...body, reason: 'too short' })).toBe(false)
    expect(accepts(createActivityEscalation, { ...body, reason: 'x'.repeat(2001) })).toBe(false)
    expect(accepts(createActivityEscalation, { ...body, clientMutationId: 'nope' })).toBe(false)
    expect(accepts(createActivityEscalation, { ...body, extra: true })).toBe(false)
  })

  it('decides with a note and a real-instant version', () => {
    const body = { note, expectedUpdatedAt: instant }
    expect(accepts(decideActivityEscalation, body)).toBe(true)
    expect(accepts(decideActivityEscalation, { ...body, note: 'short' })).toBe(false)
    expect(accepts(decideActivityEscalation, { ...body, expectedUpdatedAt: 'later' })).toBe(false)
    expect(accepts(decideActivityEscalation, { note })).toBe(false)
    expect(accepts(decideActivityEscalation, { ...body, decision: 'APPROVE' })).toBe(false)
  })

  it('shapes an escalation with optional tier fields and rejects extra keys', () => {
    const person = { id: uuid, name: 'Synthetic person' }
    const open = {
      id: uuid,
      projectId: uuid,
      activityId: uuid,
      reason: note,
      status: 'OPEN',
      raisedBy: person,
      raisedAt: instant,
      forwardedBy: null,
      forwardedAt: null,
      forwardNote: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
      resolutionLevel: null,
      updatedAt: instant,
    }
    expect(accepts(activityEscalationResponse, open)).toBe(true)
    expect(
      accepts(activityEscalationResponse, {
        ...open,
        status: 'RESOLVED',
        resolvedBy: person,
        resolvedAt: instant,
        resolutionNote: note,
        resolutionLevel: 'PROGRAM',
      }),
    ).toBe(true)
    expect(accepts(activityEscalationResponse, { ...open, resolutionLevel: 'TEAM' })).toBe(false)
    expect(accepts(activityEscalationResponse, { ...open, beneficiary: 'x' })).toBe(false)
  })
})
