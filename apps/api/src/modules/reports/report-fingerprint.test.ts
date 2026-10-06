import { describe, expect, it } from 'vitest'
import { sourceFingerprint } from './report-fingerprint'
import type { ProjectSections } from './report-project-status'

const sections: ProjectSections = {
  reportDate: '2026-10-06',
  information: {
    code: 'SYN',
    title: 'Fictional',
    status: 'ACTIVE',
    sector: 'Health',
    area: 'Region',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    manager: null,
    partners: 'Not specified',
  },
  overview: [{ area: 'Schedule', status: 'AT_RISK', comment: '1 milestone(s) overdue.' }],
  keyFigures: [
    {
      label: 'Timeline elapsed',
      state: 'AVAILABLE',
      value: '50%',
      reason: null,
      detail: '',
      percent: 50,
    },
    {
      label: 'Budget used',
      state: 'AVAILABLE',
      value: '40%',
      reason: null,
      detail: 'x',
      percent: 40,
    },
  ],
  milestones: [
    {
      title: 'Kickoff',
      status: 'PENDING',
      targetDate: '2026-09-01',
      completionDate: null,
      overdue: true,
    },
  ],
  alerts: [
    { title: 'A', severity: 'HIGH', explanation: 'E', evaluatedAt: '2026-10-05T01:00:00.000Z' },
  ],
}
const source = (s: ProjectSections | undefined, rows: string[][] = [['a']]) => ({
  projectId: 'p',
  formId: null,
  kind: s ? 'PROJECT_SUMMARY' : 'INDICATOR_SUMMARY',
  columns: ['Section'],
  rows,
  sections: s,
  unavailableReasons: [],
})

describe('source fingerprint', () => {
  it('stays stable for the same data on a different day', () => {
    const nextDay: ProjectSections = {
      ...sections,
      reportDate: '2026-10-07',
      overview: [{ area: 'Schedule', status: 'OFF_TRACK', comment: 'later' }],
      keyFigures: [
        { ...(sections.keyFigures[0] as object), value: '51%' } as never,
        sections.keyFigures[1] as never,
      ],
      milestones: [{ ...(sections.milestones?.[0] as object), overdue: false } as never],
      alerts: [
        { ...(sections.alerts?.[0] as object), evaluatedAt: '2026-10-06T01:00:00.000Z' } as never,
      ],
    }
    expect(sourceFingerprint(source(nextDay, [['b']]))).toBe(sourceFingerprint(source(sections)))
  })
  it('changes when section data or section presence changes', () => {
    const base = sourceFingerprint(source(sections))
    const budget = { ...(sections.keyFigures[1] as object), state: 'SUPPRESSED' } as never
    expect(
      sourceFingerprint(
        source({ ...sections, keyFigures: [sections.keyFigures[0] as never, budget] }),
      ),
    ).not.toBe(base)
    const { alerts: _alerts, ...withoutAlerts } = sections
    expect(sourceFingerprint(source(withoutAlerts))).not.toBe(base)
    expect(
      sourceFingerprint(
        source({
          ...sections,
          milestones: [{ ...(sections.milestones?.[0] as object), status: 'COMPLETED' } as never],
        }),
      ),
    ).not.toBe(base)
  })
  it('keeps the fingerprint of kinds without sections tied to their rows', () => {
    expect(sourceFingerprint(source(undefined, [['a']]))).not.toBe(
      sourceFingerprint(source(undefined, [['b']])),
    )
    expect(sourceFingerprint(source(undefined))).toMatch(/^[0-9a-f]{64}$/)
  })
})
