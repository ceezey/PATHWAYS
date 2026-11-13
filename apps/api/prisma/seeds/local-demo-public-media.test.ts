import { describe, expect, it, vi } from 'vitest'

import { PRODUCTION_PROJECT_REF } from './hosted-realistic-seed'
import { demoActivities } from './local-demo-data'
import { publicMediaBytes, publicMediaPlan } from './local-demo-public-media'
import { type MediaRow, pickExisting } from './local-demo-stage-public-media'
import {
  type Draft,
  type Wanted,
  nextPublicationStep,
  publications,
  selectionKey,
  viewsFor,
} from './local-demo-stage-publishing'

const keys = ['EHK', 'ALS', 'CRL', 'SSG'] as const

describe('public media plan', () => {
  it('matches the per-project counts', () => {
    const count = (key: (typeof keys)[number], kind: 'photo' | 'video') =>
      publicMediaPlan[key].filter((m) => m.kind === kind).length
    expect([count('EHK', 'photo'), count('EHK', 'video')]).toEqual([8, 2])
    expect([count('ALS', 'photo'), count('ALS', 'video')]).toEqual([6, 1])
    expect([count('CRL', 'photo'), count('CRL', 'video')]).toEqual([4, 1])
    expect([count('SSG', 'photo'), count('SSG', 'video')]).toEqual([2, 0])
  })

  it('ties every item to a started activity of its own project and a valid caption', () => {
    for (const key of keys) {
      expect(publicMediaPlan[key].length).toBeLessThanOrEqual(24)
      for (const item of publicMediaPlan[key]) {
        const activity = demoActivities[key].find((a) => a.key === item.activity)
        expect(activity?.startOffset, `${key} ${item.file}`).toBeLessThan(0)
        expect(item.caption.length).toBeGreaterThanOrEqual(1)
        expect(item.caption.length).toBeLessThanOrEqual(300)
        expect(item.caption).toContain(item.barangay)
      }
    }
  })

  it('uses each asset in one project only and keeps files within size', () => {
    const all = keys.flatMap((key) => publicMediaPlan[key])
    expect(new Set(all.map((m) => `${m.file}.${m.kind}`)).size).toBe(all.length)
    for (const key of keys)
      for (const other of keys.filter((k) => k !== key))
        for (const item of publicMediaPlan[key])
          expect(publicMediaPlan[other].some((m) => m.file === item.file)).toBe(false)
    for (const item of all) {
      const { bytes } = publicMediaBytes(item)
      expect(bytes.length, item.file).toBeLessThan(item.kind === 'photo' ? 300_000 : 1_000_000)
    }
  })
})

describe('pickExisting', () => {
  const row = (over: Partial<MediaRow>): MediaRow => ({
    id: 'a',
    sha256: 'h',
    storageReady: true,
    publicVisibilityStatus: 'APPROVED',
    status: 'VERIFIED',
    ...over,
  })
  it('reuses an approved row with the same hash', () => {
    expect(pickExisting([row({})], 'h')?.id).toBe('a')
  })
  it('skips an upload that never finished', () => {
    expect(pickExisting([row({ storageReady: false })], 'h')).toBeUndefined()
  })
  it('skips rejected rows and other hashes', () => {
    expect(
      pickExisting([row({ status: 'REJECTED' }), row({ id: 'b', sha256: 'x' })], 'h'),
    ).toBeUndefined()
  })
})

describe('nextPublicationStep', () => {
  const wanted: Wanted = {
    summary: 'S',
    state: 'PUBLISHED',
    selection: { media: [{ id: 'm', caption: 'c' }], views: ['kpi'] },
  }
  const draft = (state: 'FOR_REVIEW' | 'APPROVED' | 'PUBLISHED', over = {}): Draft => ({
    revision: 1,
    state,
    summary: 'S',
    snapshot: { views: ['kpi'], media: [{ id: 'm', caption: 'c' }] },
    ...over,
  })
  it.each([
    ['no row', null, 'SUBMIT'],
    [
      'old live selection',
      draft('PUBLISHED', { snapshot: { views: ['kpi', 'saddd'], media: [] } }),
      'SUBMIT',
    ],
    ['new summary', draft('PUBLISHED', { summary: 'T' }), 'SUBMIT'],
    [
      'new caption',
      draft('PUBLISHED', { snapshot: { views: ['kpi'], media: [{ id: 'm', caption: 'd' }] } }),
      'SUBMIT',
    ],
    [
      'reordered views',
      draft('PUBLISHED', {
        snapshot: { views: ['saddd', 'kpi'], media: [{ id: 'm', caption: 'c' }] },
      }),
      'SUBMIT',
    ],
    ['submitted', draft('FOR_REVIEW'), 'APPROVE'],
    ['approved', draft('APPROVED'), 'PUBLISH'],
    ['done', draft('PUBLISHED'), null],
  ] as const)('%s', (_, current, step) => expect(nextPublicationStep(current, wanted)).toBe(step))
  it('ignores the type and content type the database adds to snapshot media', () => {
    const filled = draft('PUBLISHED', {
      snapshot: {
        views: ['kpi'],
        media: [{ id: 'm', caption: 'c', type: 'PHOTO', contentType: 'image/jpeg' }],
      },
    })
    expect(nextPublicationStep(filled, wanted)).toBeNull()
  })
  it('stops a FOR_REVIEW target after a resubmit', () => {
    expect(nextPublicationStep(draft('FOR_REVIEW'), { ...wanted, state: 'FOR_REVIEW' })).toBeNull()
    expect(
      nextPublicationStep(draft('FOR_REVIEW', { summary: 'T' }), {
        ...wanted,
        state: 'FOR_REVIEW',
      }),
    ).toBe('SUBMIT')
  })
  it('keys a selection by its content', () => {
    expect(selectionKey(wanted)).toMatch(/^[0-9a-f]{16}$/)
    expect(selectionKey(wanted)).toBe(selectionKey({ ...wanted, state: 'FOR_REVIEW' }))
    expect(selectionKey(wanted)).not.toBe(selectionKey({ ...wanted, summary: 'T' }))
  })
  it('gives every project a different view list without map', () => {
    const lists = publications.map((p) => p.views.join(','))
    expect(new Set(lists).size).toBe(publications.length)
    for (const p of publications) {
      expect(p.views).not.toContain('map')
      expect(p.views.length).toBeGreaterThanOrEqual(2)
      expect(p.views.length).toBeLessThanOrEqual(5)
    }
  })
  it('adds the map to EHK and CRL on production only', () => {
    try {
      vi.stubEnv('PATHWAYS_HOSTED_SEED_PROJECT_REF', 'klbtoqdalmcsfjqophty')
      expect(publications.some((p) => viewsFor(p).includes('map'))).toBe(false)
      vi.stubEnv('PATHWAYS_HOSTED_SEED_PROJECT_REF', PRODUCTION_PROJECT_REF)
      const mapped = publications.filter((p) => viewsFor(p).includes('map')).map((p) => p.project)
      expect(mapped).toEqual(['EHK', 'CRL'])
      for (const p of publications) expect(viewsFor(p).length).toBeLessThanOrEqual(5)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
