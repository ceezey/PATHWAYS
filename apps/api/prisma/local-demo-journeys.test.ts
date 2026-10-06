import { describe, expect, it } from 'vitest'

import {
  type ProjectKey,
  addDaysIso,
  demoActivities,
  demoProjects,
  planCohort,
} from './local-demo-data'
import {
  type EnrollmentFact,
  activityWindow,
  journeyTracks,
  planSessions,
  planTests,
} from './local-demo-journeys'
import { attendanceForms, journeyStages } from './local-demo-stage-forms'
import { outcomes } from './local-demo-stage-outcomes'

const today = '2026-10-06'
const baseStart = { SSG: '2026-03-03' } as Partial<Record<ProjectKey, string>>
const held = ['COMPLETED', 'COMPLETED_LATE', 'PROGRESS_VERIFIED', 'PENDING_REVIEW', 'RETURNED']
const keys = Object.keys(journeyTracks) as ProjectKey[]
const assessedTrack = (key: ProjectKey) => (journeyTracks[key] ?? []).findIndex((t) => t.assessed)

/** Enrollment facts as the seed leaves them: outcomes end some enrollments on their event date. */
function facts(key: ProjectKey): EnrollmentFact[] {
  const project = demoProjects.find((p) => p.key === key) as (typeof demoProjects)[number]
  const start = baseStart[key] ?? addDaysIso(today, project.startOffset)
  return planCohort(project, today, start).map((person, ordinal) => {
    const outcome = outcomes.find((o) => o.project === key && o.people.includes(ordinal))
    const status =
      outcome?.eventType === 'COMPLETION'
        ? 'COMPLETED'
        : outcome?.eventType === 'DROPOUT'
          ? 'DROPPED'
          : 'ACTIVE'
    const endedDate = outcome ? addDaysIso(today, -(outcome.daysAgo ?? 0)) : null
    return { ordinal, enrollmentDate: person.enrollmentDate, endedDate, status }
  })
}

const assessedDates = (key: ProjectKey, who: EnrollmentFact) =>
  planSessions(key, who, today)
    .filter((s) => s.track === assessedTrack(key))
    .map((s) => s.date)

describe('journey records follow the product prerequisites', () => {
  it('attaches attendance only to activities that are held, never started or cancelled', () => {
    for (const key of keys)
      for (const track of journeyTracks[key] ?? []) {
        const activity = demoActivities[key].find((a) => a.key === track.activity)
        expect(
          held.concat('IN_PROGRESS', 'OVERDUE_EXPLAINED'),
          `${key}:${track.activity}`,
        ).toContain(activity?.outcome)
      }
  })

  it('maps every track to its stage and publishes a bound attendance form before any session', () => {
    for (const key of keys)
      for (const track of journeyTracks[key] ?? []) {
        const stage = journeyStages[key]?.find((s) => s.code === track.stage)
        expect(stage?.activityKeys, `${key}:${track.stage}`).toContain(track.activity)
        const form = (attendanceForms[key] ?? []).find((f) => f.activityKey === track.activity)
        expect(form?.stageCode, `${key}:${track.activity}`).toBe(track.stage)
      }
  })

  it('keeps sessions inside the activity window, the enrollment and the past', () => {
    for (const key of keys)
      for (const who of facts(key))
        for (const session of planSessions(key, who, today)) {
          const track = (journeyTracks[key] ?? [])[session.track]
          const window = activityWindow(key, track.activity, today)
          expect(session.date >= window.start && session.date <= window.end).toBe(true)
          expect(session.date > who.enrollmentDate && session.date < today).toBe(true)
          if (who.endedDate) expect(session.date <= who.endedDate).toBe(true)
        }
  })

  it('gives every completed enrollment attendance, a closing session and pre and post tests', () => {
    for (const key of keys)
      for (const who of facts(key).filter((f) => f.status === 'COMPLETED')) {
        const sessions = planSessions(key, who, today)
        expect(sessions.length, `${key} #${who.ordinal}`).toBeGreaterThan(0)
        expect(sessions.some((s) => s.progress === 'COMPLETED')).toBe(true)
        const tests = planTests(who, assessedDates(key, who))
        expect(
          tests.map((t) => t.type),
          `${key} #${who.ordinal}`,
        ).toEqual(['PRE_TEST', 'POST_TEST'])
      }
  })

  it('dates each test on an attended session, pre-test before post-test', () => {
    for (const key of keys)
      for (const who of facts(key)) {
        const dates = assessedDates(key, who)
        const tests = planTests(who, dates)
        for (const test of tests) expect(dates).toContain(test.date)
        if (tests.length === 2) expect(tests[0].date < tests[1].date).toBe(true)
      }
  })

  it('stops people who left a week before they left and gives them no post-test', () => {
    for (const key of keys)
      for (const who of facts(key).filter((f) => f.status === 'DROPPED')) {
        for (const session of planSessions(key, who, today))
          expect(session.date <= addDaysIso(who.endedDate as string, -7)).toBe(true)
        expect(planTests(who, assessedDates(key, who)).map((t) => t.type)).not.toContain(
          'POST_TEST',
        )
      }
  })

  it('leaves only a small minority of older active enrollments without attendance', () => {
    for (const key of keys) {
      const active = facts(key).filter(
        (who) => who.status === 'ACTIVE' && who.enrollmentDate < addDaysIso(today, -30),
      )
      const without = active.filter((who) => planSessions(key, who, today).length === 0)
      expect(without.length / Math.max(1, active.length), key).toBeLessThanOrEqual(0.1)
    }
  })

  it('keeps pre-test scores below post-test scores for most completers', () => {
    let better = 0
    let total = 0
    for (const key of keys)
      for (const who of facts(key).filter((f) => f.status === 'COMPLETED')) {
        const [pre, post] = planTests(who, assessedDates(key, who))
        total += 1
        if (post.score > pre.score) better += 1
      }
    expect(better / total).toBeGreaterThan(0.8)
  })
})
