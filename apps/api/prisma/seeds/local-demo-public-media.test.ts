import { describe, expect, it } from 'vitest'

import { demoActivities } from './local-demo-data'
import { publicMediaBytes, publicMediaPlan } from './local-demo-public-media'

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
