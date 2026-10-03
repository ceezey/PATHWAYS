/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAX_DASHBOARD_PINS, addPin, readPins, removePin } from './dashboard-pins'

const pin = (projectId: string, view: 'kpi' | 'participation' = 'kpi') => ({
  view,
  projectId,
  periodStart: '2026-01-01',
  periodEnd: '2026-03-31',
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('dashboard pins', () => {
  it('adds a pin as a reference only and reads it back per user', () => {
    expect(addPin('u1', pin('p1'))).toBe('added')
    const [stored] = readPins('u1')
    expect(Object.keys(stored).sort()).toEqual(
      ['createdAt', 'id', 'periodEnd', 'periodStart', 'projectId', 'view'].sort(),
    )
    expect(readPins('u2')).toEqual([])
  })

  it('strips a stored project name and drops views the UI can no longer create', () => {
    const legacy = {
      id: 'a',
      view: 'kpi',
      projectId: 'p1',
      projectName: 'Private title',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    window.localStorage.setItem(
      'pathways.dashboardPins.v1.u1',
      JSON.stringify([legacy, { ...legacy, id: 'b', view: 'budget' }]),
    )
    expect(readPins('u1')).toEqual([
      { id: 'a', view: 'kpi', projectId: 'p1', createdAt: '2026-01-01T00:00:00.000Z' },
    ])
  })

  it('de-duplicates identical pins but keeps a different view or period', () => {
    addPin('u1', pin('p1'))
    expect(addPin('u1', pin('p1'))).toBe('duplicate')
    expect(addPin('u1', pin('p1', 'participation'))).toBe('added')
    expect(addPin('u1', { ...pin('p1'), periodEnd: '2026-06-30' })).toBe('added')
    expect(readPins('u1')).toHaveLength(3)
  })

  it('caps pins at the maximum', () => {
    for (let index = 0; index < MAX_DASHBOARD_PINS; index += 1)
      expect(addPin('u1', pin(`p${index}`))).toBe('added')
    expect(addPin('u1', pin('extra'))).toBe('full')
    expect(readPins('u1')).toHaveLength(MAX_DASHBOARD_PINS)
  })

  it('removes a pin by id', () => {
    addPin('u1', pin('p1'))
    addPin('u1', pin('p2'))
    const [first] = readPins('u1')
    expect(removePin('u1', first.id)).toBe(true)
    expect(readPins('u1').map((row) => row.projectId)).toEqual(['p2'])
  })

  it('ignores corrupt stored data', () => {
    window.localStorage.setItem('pathways.dashboardPins.v1.u1', '{not json')
    expect(readPins('u1')).toEqual([])
    window.localStorage.setItem('pathways.dashboardPins.v1.u1', JSON.stringify([{ id: 1 }, 'x']))
    expect(readPins('u1')).toEqual([])
  })

  it('degrades without throwing when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readPins('u1')).toEqual([])
    expect(addPin('u1', pin('p1'))).toBe('unavailable')
    expect(removePin('u1', 'x')).toBe(false)
  })
})
