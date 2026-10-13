import { describe, expect, it } from 'vitest'

import {
  correctJourneyEventRequest,
  journeyStageInput,
  recordJourneyEventRequest,
  saveJourneyStagesRequest,
} from './journey-requests'

const stage = { code: 'J1', name: 'Intake', order: 1, type: 'ENTRY', mappedActivityIds: [] }
const codeAccepted = (code: unknown) => journeyStageInput.safeParse({ ...stage, code }).success

describe('journey request contracts', () => {
  it.each(['J1', 'J3.1', 'J3-1', 'FOLLOW_UP', ' j3.1 '])('accepts the stage code %j', (code) => {
    expect(codeAccepted(code)).toBe(true)
  })

  it.each(['J', '.J3', 'J3 1', 'J3/1', 'X'.repeat(41), 12])('rejects the stage code %j', (code) => {
    expect(codeAccepted(code)).toBe(false)
  })

  it('upper-cases the code and defaults an absent terminal flag to false', () => {
    expect(saveJourneyStagesRequest.parse({ stages: [{ ...stage, code: ' j3.1 ' }] })).toEqual({
      stages: [{ ...stage, code: 'J3.1', terminal: false }],
    })
    expect(journeyStageInput.parse({ ...stage, terminal: null }).terminal).toBeNull()
  })

  it('trims a journey note and rejects one left empty', () => {
    const event = { eventType: 'FOLLOW_UP', eventDate: '2026-06-01', description: 'Checked in' }
    expect(recordJourneyEventRequest.parse({ ...event, note: '  Visited  ' }).note).toBe('Visited')
    expect(recordJourneyEventRequest.safeParse({ ...event, note: '   ' }).success).toBe(false)
  })

  it('requires a non-empty correction reason', () => {
    const fix = { eventDate: '2026-06-02', description: 'Corrected' }
    expect(correctJourneyEventRequest.safeParse({ ...fix, reason: 'Typo' }).success).toBe(true)
    expect(correctJourneyEventRequest.safeParse({ ...fix, reason: '' }).success).toBe(false)
  })
})
