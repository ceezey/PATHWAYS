import { describe, expect, it } from 'vitest'
import { flattenSections, metricPercent, overviewRows } from './report-project-status'

const base = { reportDate: '2026-10-06', milestones: [], timeline: 50, budget: 50, kpi: 50 }
const status = (over: object, area: string) =>
  overviewRows({ ...base, ...over }).find((row) => row.area === area)?.status

describe('project status overview rules', () => {
  it('rates schedule by overdue milestones', () => {
    const m = (targetDate: string, state = 'PENDING') => ({ targetDate, status: state })
    expect(status({ milestones: [m('2026-10-06')] }, 'Schedule')).toBe('ON_TRACK')
    expect(status({ milestones: [m('2026-10-05')] }, 'Schedule')).toBe('AT_RISK')
    expect(status({ milestones: [m('2026-09-06')] }, 'Schedule')).toBe('AT_RISK')
    expect(status({ milestones: [m('2026-09-05')] }, 'Schedule')).toBe('OFF_TRACK')
    expect(status({ milestones: [m('2026-01-01', 'COMPLETED')] }, 'Schedule')).toBe('ON_TRACK')
    expect(status({ milestones: [m('2026-01-01', 'CANCELLED')] }, 'Schedule')).toBe('ON_TRACK')
    expect(status({ milestones: [] }, 'Schedule')).toBe('NOT_AVAILABLE')
    expect(status({ milestones: null }, 'Schedule')).toBe('NOT_AVAILABLE')
  })
  it('rates budget against timeline at each boundary', () => {
    expect(status({ timeline: 50, budget: 65 }, 'Budget')).toBe('ON_TRACK')
    expect(status({ timeline: 50, budget: 65.1 }, 'Budget')).toBe('AT_RISK')
    expect(status({ timeline: 100, budget: 100 }, 'Budget')).toBe('ON_TRACK')
    expect(status({ timeline: 100, budget: 100.1 }, 'Budget')).toBe('OFF_TRACK')
    expect(status({ timeline: null, budget: 120 }, 'Budget')).toBe('OFF_TRACK')
    expect(status({ timeline: null, budget: 100 }, 'Budget')).toBe('NOT_AVAILABLE')
    expect(status({ timeline: null, budget: null }, 'Budget')).toBe('NOT_AVAILABLE')
    expect(status({ timeline: 30.2, budget: 45.2 }, 'Budget')).toBe('ON_TRACK')
    expect(status({ timeline: 30.2, budget: 45.3 }, 'Budget')).toBe('AT_RISK')
    expect(status({ timeline: null, budget: 50 }, 'Budget')).toBe('NOT_AVAILABLE')
    expect(status({ budget: null }, 'Budget')).toBe('NOT_AVAILABLE')
  })
  it('rates indicators against timeline at each boundary', () => {
    expect(status({ timeline: 50, kpi: 40 }, 'Indicators')).toBe('ON_TRACK')
    expect(status({ timeline: 50, kpi: 39.9 }, 'Indicators')).toBe('AT_RISK')
    expect(status({ timeline: 50, kpi: 25 }, 'Indicators')).toBe('AT_RISK')
    expect(status({ timeline: 50, kpi: 24.9 }, 'Indicators')).toBe('OFF_TRACK')
    expect(status({ timeline: 30.2, kpi: 20.2 }, 'Indicators')).toBe('ON_TRACK')
    expect(status({ timeline: 50.3, kpi: 25.3 }, 'Indicators')).toBe('AT_RISK')
    expect(status({ kpi: null }, 'Indicators')).toBe('NOT_AVAILABLE')
  })
  it('gives every row a one-line comment', () => {
    for (const row of overviewRows(base)) expect(row.comment.length).toBeGreaterThan(0)
  })
})

describe('metric percent', () => {
  it('reads only visible values', () => {
    expect(metricPercent({ state: 'AVAILABLE', value: '42.5', reason: null })).toBe(42.5)
    expect(metricPercent({ state: 'ZERO', value: '0', reason: null })).toBe(0)
    expect(metricPercent({ state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' })).toBeNull()
    expect(metricPercent(null)).toBeNull()
  })
})

describe('flattened sections', () => {
  it('copies each present section into table rows', () => {
    const { columns, rows } = flattenSections({
      reportDate: '2026-10-06',
      information: {
        code: 'SYN',
        title: 'Fictional',
        status: 'ACTIVE',
        sector: 'Health',
        area: 'Region',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        manager: 'Maria Santos',
        partners: 'Partner A',
      },
      keyFigures: [
        {
          label: 'Beneficiaries reached',
          state: 'SUPPRESSED',
          value: null,
          reason: 'SMALL_CELL',
          detail: '',
          percent: null,
        },
      ],
      overview: [{ area: 'Schedule', status: 'ON_TRACK', comment: 'No overdue milestones.' }],
      milestones: [
        {
          title: 'Kickoff',
          status: 'PENDING',
          targetDate: '2026-01-01',
          completionDate: null,
          overdue: true,
        },
      ],
    })
    expect(columns).toEqual(['Section', 'Item', 'Value', 'Detail'])
    expect(rows.every((row) => row.length === columns.length)).toBe(true)
    expect(rows.flat().join('|')).toContain('Schedule')
    expect(rows.flat().join('|')).toContain('Kickoff')
    expect(rows.flat().join('|')).toContain('Maria Santos')
    expect(rows.flat()).toContain('Fewer than 5')
  })
})
