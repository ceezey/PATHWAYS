import { describe, expect, it } from 'vitest'

import { activityEvidenceContentTypes } from './activity-evidence'
import {
  createActivityRequest,
  recordActivityProgressRequest,
  recordOverdueExplanationRequest,
  reserveActivityProofRequest,
  reviewActivityUpdateRequest,
  saveMilestoneRequest,
  transitionActivityRequest,
  updateActivityRequest,
  updateMilestoneRequest,
} from './activity-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const instant = '2026-09-24T00:00:00.000Z'
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success
const create = {
  clientMutationId: uuid,
  title: 'Synthetic activity',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  assignedUserIds: [],
}
const progress = { clientUpdateId: uuid, progressPercent: 45, note: 'Halfway through sessions.' }
const sha = (n: number) => n.toString(16).padStart(64, '0')
const file = {
  fileName: 'report.pdf',
  contentType: 'application/pdf',
  byteSize: 1_048_576,
  sha256: sha(1),
}

describe('activity request contracts', () => {
  it('normalizes the code, the count and the budget as the DTO transforms did', () => {
    expect(
      createActivityRequest.parse({
        ...create,
        code: ' act-01 ',
        targetBeneficiaries: '50',
        budgetAllocation: ' 25000.25 ',
      }),
    ).toEqual({ ...create, code: 'ACT-01', targetBeneficiaries: 50, budgetAllocation: '25000.25' })
  })

  it('keeps null on the optional fields the DTO let through', () => {
    const nulls = {
      code: null,
      description: null,
      activityType: null,
      timelineOverrideJustification: null,
      targetBeneficiaries: null,
      journeyStageId: null,
    }
    expect(createActivityRequest.parse({ ...create, ...nulls })).toEqual({ ...create, ...nulls })
  })

  it.each([
    { budgetAllocation: null },
    { indicatorIds: null },
    { assignedUserIds: [uuid, uuid] },
    { indicatorIds: [uuid, uuid] },
    { targetBeneficiaries: -1 },
    { targetBeneficiaries: 2_147_483_648 },
    { targetBeneficiaries: 1.5 },
    { budgetAllocation: '-1' },
    { budgetAllocation: '100.001' },
    { budgetAllocation: '1e3' },
    { plannedStartDate: '2026-02-30' },
    { code: '-AB' },
    { targetGoal: 1 },
    JSON.parse('{"__proto__":{"a":1}}'),
  ])('rejects %j on create', (extra) => {
    expect(accepts(createActivityRequest, { ...create, ...extra })).toBe(false)
  })

  it('accepts the complete repaired transport contract with blank links', () => {
    const parsed = createActivityRequest.parse({
      ...create,
      plannedStartDate: '2025-12-01',
      timelineOverrideJustification: 'Approved early mobilization',
      targetBeneficiaries: '50',
      budgetAllocation: '25000.25',
      indicatorIds: [],
      journeyStageId: null,
    })
    expect(parsed.targetBeneficiaries).toBe(50)
  })

  it('requires the version only on update, and takes any ISO 8601 form for it', () => {
    expect(accepts(updateActivityRequest, { ...create, expectedUpdatedAt: instant })).toBe(true)
    expect(accepts(updateActivityRequest, { ...create, expectedUpdatedAt: '2026-02-30' })).toBe(
      true,
    )
    expect(accepts(updateActivityRequest, create)).toBe(false)
    expect(accepts(createActivityRequest, { ...create, expectedUpdatedAt: instant })).toBe(false)
  })

  it('takes only the two requested transition statuses', () => {
    const body = { clientMutationId: uuid, status: 'IN_PROGRESS', expectedUpdatedAt: instant }
    expect(accepts(transitionActivityRequest, body)).toBe(true)
    expect(accepts(transitionActivityRequest, { ...body, status: 'CANCELLED', reason: null })).toBe(
      true,
    )
    expect(accepts(transitionActivityRequest, { ...body, status: 'COMPLETED' })).toBe(false)
  })

  it.each([
    { progressPercent: 101 },
    { progressPercent: -1 },
    { progressPercent: '50' },
    { clientUpdateId: 'not-a-uuid' },
    { note: '' },
  ])('rejects the progress input %j', (invalid) => {
    expect(accepts(recordActivityProgressRequest, { ...progress, ...invalid })).toBe(false)
  })

  it('accepts a complete progress note and rejects one without a note', () => {
    expect(accepts(recordActivityProgressRequest, progress)).toBe(true)
    expect(
      accepts(recordActivityProgressRequest, { clientUpdateId: uuid, progressPercent: 10 }),
    ).toBe(false)
  })

  it('checks the overdue category and the explanation length', () => {
    const body = {
      clientMutationId: uuid,
      category: 'WEATHER',
      explanation: 'Valid enough explanation text here.',
    }
    expect(accepts(recordOverdueExplanationRequest, body)).toBe(true)
    for (const invalid of [
      { category: 'HURRICANE' },
      { explanation: 'too short' },
      { explanation: 'x'.repeat(2001) },
      { clientMutationId: 'not-a-uuid' },
    ])
      expect(accepts(recordOverdueExplanationRequest, { ...body, ...invalid })).toBe(false)
    expect(
      accepts(recordOverdueExplanationRequest, {
        category: 'WEATHER',
        explanation: body.explanation,
      }),
    ).toBe(false)
  })

  it('checks the review decision and reason', () => {
    const body = {
      clientMutationId: uuid,
      decision: 'APPROVE',
      reason: 'Evidence verified.',
      expectedUpdatedAt: instant,
    }
    expect(accepts(reviewActivityUpdateRequest, body)).toBe(true)
    expect(accepts(reviewActivityUpdateRequest, { ...body, decision: 'REJECT' })).toBe(false)
    expect(accepts(reviewActivityUpdateRequest, { ...body, reason: '' })).toBe(false)
  })

  it('takes optional dates and null text on milestones and checks the status on update', () => {
    expect(
      accepts(saveMilestoneRequest, { title: 'Phase one', description: null, targetDate: null }),
    ).toBe(true)
    expect(accepts(saveMilestoneRequest, { title: 'Phase one', targetDate: '2026-02-30' })).toBe(
      false,
    )
    const update = {
      title: 'Phase one',
      status: 'COMPLETED',
      completionDate: '2026-03-01',
      expectedUpdatedAt: instant,
    }
    expect(accepts(updateMilestoneRequest, update)).toBe(true)
    expect(accepts(updateMilestoneRequest, { ...update, status: 'DONE' })).toBe(false)
    expect(accepts(updateMilestoneRequest, { ...update, expectedUpdatedAt: undefined })).toBe(false)
  })
})

describe('proof reservation contract', () => {
  const reserve = { ...progress, note: '  Sessions held with evidence.  ', files: [file] }

  it('accepts one to ten files and an optional session count', () => {
    expect(accepts(reserveActivityProofRequest, reserve)).toBe(true)
    expect(
      accepts(reserveActivityProofRequest, { ...reserve, beneficiariesReachedThisSession: null }),
    ).toBe(true)
    expect(accepts(reserveActivityProofRequest, { ...reserve, files: [] })).toBe(false)
    const eleven = Array.from({ length: 11 }, (_, index) => ({ ...file, sha256: sha(index + 20) }))
    expect(accepts(reserveActivityProofRequest, { ...reserve, files: eleven })).toBe(false)
  })

  it.each([
    { ...file, contentType: 'text/html' },
    { ...file, contentType: 'image/gif' },
    { ...file, fileName: '../escape.pdf' },
    { ...file, fileName: 'a\\b.pdf' },
    { ...file, fileName: 'x'.repeat(129) },
    { ...file, sha256: 'F'.repeat(64) },
    { ...file, byteSize: 0 },
    { ...file, byteSize: 104_857_601 },
    { ...file, unexpected: true },
  ])('rejects the evidence file %j', (invalid) => {
    expect(accepts(reserveActivityProofRequest, { ...reserve, files: [invalid] })).toBe(false)
  })

  it.each([-1, 1.5, 100001])('rejects the session count %s', (value) => {
    expect(
      accepts(reserveActivityProofRequest, { ...reserve, beneficiariesReachedThisSession: value }),
    ).toBe(false)
  })

  it('declares the seven evidence content types', () => {
    expect(activityEvidenceContentTypes).toHaveLength(7)
  })
})
