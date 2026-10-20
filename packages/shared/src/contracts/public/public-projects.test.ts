import { describe, expect, it } from 'vitest'

import { publicProjectResponse, publicationTransitionRequest } from './public-projects'

const snapshot = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Synthetic published project',
  code: 'SYN-01',
  approvedSummary: 'Approved synthetic summary.',
  area: 'Synthetic area',
  sector: null,
  startDate: '2026-01-01',
  endDate: null,
  publishedAt: '2026-09-27T00:00:00.000Z',
}

describe('public project contracts', () => {
  it('accepts an approved snapshot', () => {
    expect(publicProjectResponse.parse(snapshot)).toEqual(snapshot)
  })

  it.each([
    { ...snapshot, budget: 1 },
    { ...snapshot, area: 'a'.repeat(501) },
    { ...snapshot, publishedAt: '2026-09-27' },
  ])('rejects the snapshot %j', (value) => {
    expect(publicProjectResponse.safeParse(value).success).toBe(false)
  })

  it('trims a submitted summary', () => {
    const body = {
      clientRequestId: '20000000-0000-4000-8000-000000000002',
      expectedRevision: 0,
      summary: '  Approved summary  ',
    }
    expect(publicationTransitionRequest.parse(body)).toEqual({
      ...body,
      summary: 'Approved summary',
    })
  })

  it.each([
    { clientRequestId: 'not-a-uuid', expectedRevision: 0 },
    { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: -1 },
    { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: 2147483647 },
  ])('rejects the publication body %j', (body) => {
    expect(publicationTransitionRequest.safeParse(body).success).toBe(false)
  })

  it.each([
    ['a text id', { id: 'not-a-uuid' }, false],
    ['an empty title', { title: '' }, false],
    ['a 300 character title', { title: 't'.repeat(300) }, true],
    ['a 301 character title', { title: 't'.repeat(301) }, false],
    ['a 100 character code', { code: 'c'.repeat(100) }, true],
    ['a 101 character code', { code: 'c'.repeat(101) }, false],
    ['an empty summary', { approvedSummary: '' }, false],
    ['a 4000 character summary', { approvedSummary: 's'.repeat(4000) }, true],
    ['a 4001 character summary', { approvedSummary: 's'.repeat(4001) }, false],
    ['a 500 character area', { area: 'a'.repeat(500) }, true],
    ['a null area', { area: null }, true],
    ['a missing area', { area: undefined }, false],
    ['a 300 character sector', { sector: 's'.repeat(300) }, true],
    ['a 301 character sector', { sector: 's'.repeat(301) }, false],
    ['a null start date', { startDate: null }, true],
    ['a number as the start date', { startDate: 5 }, false],
    ['an end date', { endDate: '2026-12-31' }, true],
    ['a time with an offset', { publishedAt: '2026-09-27T08:00:00+08:00' }, true],
    ['a time without a zone', { publishedAt: '2026-09-27T00:00:00' }, false],
  ])('checks the snapshot field: %s', (_label, change, accepted) => {
    expect(publicProjectResponse.safeParse({ ...snapshot, ...change }).success).toBe(accepted)
  })

  it.each([
    ['revision 0', { expectedRevision: 0 }, true],
    ['the last revision', { expectedRevision: 2147483646 }, true],
    ['a revision past it', { expectedRevision: 2147483647 }, false],
    ['a fractional revision', { expectedRevision: 1.5 }, false],
    ['an absent summary', {}, true],
    ['a 4000 character summary', { summary: 's'.repeat(4000) }, true],
    ['a 4001 character summary', { summary: 's'.repeat(4001) }, false],
    ['an empty summary', { summary: '' }, false],
    ['a blank summary', { summary: '   ' }, false],
    ['a null summary', { summary: null }, false],
    ['an unknown key', { reviewer: 'x' }, false],
  ])('checks the publication body: %s', (_label, change, accepted) => {
    const body = { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: 0 }
    expect(publicationTransitionRequest.safeParse({ ...body, ...change }).success).toBe(accepted)
  })
})
