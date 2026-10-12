import { describe, expect, it } from 'vitest'

import { activityExtensionResponse, activityExtensionStatuses } from './activity-extension-response'

const uuid = '10000000-0000-4000-8000-000000000001'
const instant = '2026-09-24T00:00:00.000Z'
const person = { id: '10000000-0000-4000-8000-000000000002', name: 'Ana Cruz' }
const row = {
  id: uuid,
  projectId: '10000000-0000-4000-8000-000000000003',
  activityId: '10000000-0000-4000-8000-000000000004',
  currentEndDate: '2026-12-31',
  requestedEndDate: '2027-01-31',
  reason: 'The venue was unavailable.',
  status: 'PENDING',
  requestedBy: person,
  requestedAt: instant,
  verifiedBy: null,
  verifiedAt: null,
  verificationNote: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  updatedAt: instant,
}
const accepts = (value: unknown) => activityExtensionResponse.safeParse(value).success

describe('activity extension response contract', () => {
  it('takes a pending request and a decided one with its reviewers', () => {
    expect(accepts(row)).toBe(true)
    expect(
      accepts({
        ...row,
        status: 'APPROVED',
        verifiedBy: person,
        verifiedAt: instant,
        verificationNote: 'Verified.',
        decidedBy: person,
        decidedAt: instant,
        decisionNote: 'Approved.',
      }),
    ).toBe(true)
    expect(activityExtensionStatuses).toEqual([
      'PENDING',
      'VERIFIED',
      'RETURNED',
      'APPROVED',
      'DECLINED',
    ])
  })

  it('has a null current end date for an activity without one', () => {
    expect(accepts({ ...row, currentEndDate: null })).toBe(true)
  })

  it.each([
    ['an unknown key', { ...row, extra: true }],
    ['an unknown status', { ...row, status: 'WITHDRAWN' }],
    ['a date that is not on the calendar', { ...row, requestedEndDate: '2027-02-30' }],
    ['an unknown key on a person', { ...row, requestedBy: { ...person, email: 'a@example.test' } }],
    ['a note over 2000 characters', { ...row, reason: 'x'.repeat(2001) }],
    ['an instant without a time', { ...row, updatedAt: '2026-09-24' }],
  ])('refuses %s', (_label, value) => {
    expect(accepts(value)).toBe(false)
  })
})
