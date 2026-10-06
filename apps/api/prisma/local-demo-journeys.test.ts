import { describe, expect, it } from 'vitest'

import {
  type ProjectKey,
  addDaysIso,
  demoActivities,
  demoCohorts,
  demoProjects,
  planCohort,
} from './local-demo-data'
import {
  type EnrollmentFact,
  activityWindow,
  branchOf,
  journeyTracks,
  planSessions,
  planTests,
  plannedFacts,
  projectStartIso,
  sessionRoster,
} from './local-demo-journeys'
import { attendanceForms, journeyStages } from './local-demo-stage-forms'

const today = '2026-10-06'
const held = ['COMPLETED', 'COMPLETED_LATE', 'PROGRESS_VERIFIED', 'PENDING_REVIEW', 'RETURNED']
const keys = Object.keys(journeyTracks) as ProjectKey[]
const trackIndex = (key: ProjectKey, assess: 'pre' | 'post') =>
  (journeyTracks[key] ?? []).findIndex((t) => t.assess === assess)

/** Enrollment facts as the seed leaves them: outcomes end some enrollments on their event date. */
function facts(key: ProjectKey): EnrollmentFact[] {
  const project = demoProjects.find((p) => p.key === key) as (typeof demoProjects)[number]
  return planCohort(project, today, projectStartIso(key, today)).map((person, ordinal) => ({
    ordinal,
    enrollmentDate: person.enrollmentDate,
    ...plannedFacts(key, person.code, today),
  }))
}

const datesOf = (key: ProjectKey, who: EnrollmentFact, track: number) =>
  planSessions(key, who, today)
    .filter((s) => s.track === track)
    .map((s) => s.date)

const testsOf = (key: ProjectKey, who: EnrollmentFact) => {
  const post = trackIndex(key, 'post')
  return planTests(
    who,
    datesOf(key, who, trackIndex(key, 'pre')),
    post >= 0 ? datesOf(key, who, post) : null,
  )
}

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

  it('declares the webinar, two branches and the post step under WEBINAR for SSG and ALS', () => {
    for (const key of ['SSG', 'ALS'] as const) {
      const stages = journeyStages[key] ?? []
      const webinar = stages.find((s) => s.code === 'WEBINAR')
      expect(webinar?.type).toBe('CORE')
      for (const code of ['ENTREP', 'TECH']) {
        const branch = stages.find((s) => s.code === code)
        expect(branch?.type).toBe('BRANCH')
        expect(branch?.parent).toBe('WEBINAR')
        expect((branch?.order ?? 0) > (webinar?.order ?? 99)).toBe(true)
      }
      const post = stages.find((s) => s.code === (key === 'SSG' ? 'POST-ASSESSMENT' : 'ASSESSED'))
      expect((post?.order ?? 0) > (stages.find((s) => s.code === 'TECH')?.order ?? 99)).toBe(true)
    }
    for (const code of ['ENROLLED', 'LIFESKILLS', 'PEER-EDUCATOR', 'FOLLOW-UP', 'COMPLETED'])
      expect(
        journeyStages.SSG?.some((s) => s.code === code),
        code,
      ).toBe(true)
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

  it('follows stage order by date, one branch per person, post-test only after a branch', () => {
    for (const key of ['SSG', 'ALS'] as const) {
      const tracks = journeyTracks[key] ?? []
      for (const who of facts(key)) {
        const sessions = planSessions(key, who, today)
        const order = sessions.map((s) => s.track)
        expect(order, `${key} #${who.ordinal}`).toEqual([...order].sort((a, b) => a - b))
        const branches = new Set(sessions.map((s) => tracks[s.track].branch).filter(Boolean))
        expect(branches.size).toBeLessThanOrEqual(1)
        if (sessions.some((s) => tracks[s.track].assess === 'post')) expect(branches.size).toBe(1)
        for (let i = 1; i < sessions.length; i += 1)
          expect(sessions[i].date > sessions[i - 1].date).toBe(true)
      }
    }
  })

  it('splits SSG and ALS people across the two branches about 55 to 45', () => {
    for (const key of ['SSG', 'ALS'] as const) {
      const people = facts(key)
      const first = people.filter((who) => branchOf(who.ordinal) === 'A').length
      expect(first / people.length, key).toBeGreaterThan(0.45)
      expect(first / people.length, key).toBeLessThan(0.65)
    }
  })

  it('gives every completed enrollment attendance, a closing session and pre and post tests', () => {
    for (const key of keys)
      for (const who of facts(key).filter((f) => f.status === 'COMPLETED')) {
        const sessions = planSessions(key, who, today)
        expect(sessions.length, `${key} #${who.ordinal}`).toBeGreaterThan(0)
        expect(sessions[sessions.length - 1].progress).toBe('COMPLETED')
        expect(
          testsOf(key, who).map((t) => t.type),
          `${key} #${who.ordinal}`,
        ).toEqual(['PRE_TEST', 'POST_TEST'])
      }
  })

  it('dates each test on an attended session, pre-test before post-test', () => {
    for (const key of keys)
      for (const who of facts(key)) {
        const all = planSessions(key, who, today).map((s) => s.date)
        const tests = testsOf(key, who)
        for (const test of tests) expect(all).toContain(test.date)
        if (tests.length === 2) expect(tests[0].date < tests[1].date).toBe(true)
      }
  })

  it('stops people who left a week before they left and gives them no post-test', () => {
    for (const key of keys)
      for (const who of facts(key).filter((f) => f.status === 'DROPPED')) {
        for (const session of planSessions(key, who, today))
          expect(session.date <= addDaysIso(who.endedDate as string, -7)).toBe(true)
        expect(testsOf(key, who).map((t) => t.type)).not.toContain('POST_TEST')
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

  it('keeps pre-test scores below post-test scores for most people with both', () => {
    let better = 0
    let total = 0
    for (const key of keys)
      for (const who of facts(key)) {
        const [pre, post] = testsOf(key, who)
        if (!post) continue
        total += 1
        if (post.score > pre.score) better += 1
      }
    expect(total).toBeGreaterThan(10)
    expect(better / total).toBeGreaterThan(0.8)
  })

  it('lists the attendees of the latest session of an attended activity for the proof sheet', () => {
    const roster = sessionRoster('ALS', 'reviewclass', today)
    expect(roster?.people.length).toBeGreaterThan(0)
    expect((roster?.people.length ?? 0) <= demoCohorts.ALS.count).toBe(true)
    expect(sessionRoster('ALS', 'mapping', today)).toBeNull()
  })
})
