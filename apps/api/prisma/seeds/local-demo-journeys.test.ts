import { describe, expect, it, vi } from 'vitest'

import { type ProjectKey, addDaysIso, demoActivities, demoCohorts } from './local-demo-data'
import {
  type EnrollmentFact,
  activityWindow,
  branchOf,
  cohortPeople,
  journeyTracks,
  pendingSessions,
  planSessions,
  planTests,
  plannedFacts,
  plannedReach,
  sessionRoster,
} from './local-demo-journeys'
import { attendanceForms, journeyStages } from './local-demo-stage-forms'
import { firstRunLatest } from './local-demo-stage-journeys'
import { outcomes } from './local-demo-stage-outcomes'

const today = '2026-10-06'
const held = ['COMPLETED', 'COMPLETED_LATE', 'PROGRESS_VERIFIED', 'PENDING_REVIEW', 'RETURNED']
const keys = Object.keys(journeyTracks) as ProjectKey[]
const trackIndex = (key: ProjectKey, assess: 'pre' | 'post') =>
  (journeyTracks[key] ?? []).findIndex((t) => t.assess === assess)

/** Enrollment facts as the seed leaves them, imported people included. */
function facts(key: ProjectKey): EnrollmentFact[] {
  return cohortPeople(key, today).map(({ person, ordinal }) => ({
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

  it('skips stored sessions on a retry so nobody is rescheduled or moved back a stage', () => {
    for (const key of keys)
      for (const who of facts(key)) {
        const planned = planSessions(key, who, today)
        const stored = new Set(planned.map((s) => `${s.track}|${s.date}`))
        expect(pendingSessions(planned, stored, (s) => `${s.track}|${s.date}`)).toEqual([])
        // The same plan comes back for the same input, so a retry cannot reorder stages.
        expect(planSessions(key, who, today)).toEqual(planned)
      }
  })

  it('reports reach equal to the distinct people the seed records as attending', () => {
    for (const key of keys)
      for (const track of journeyTracks[key] ?? []) {
        const reach = plannedReach(key, track.activity, today)
        const people = facts(key).filter((who) =>
          planSessions(key, who, today).some(
            (s) =>
              (journeyTracks[key] ?? [])[s.track].activity === track.activity &&
              s.attendance !== 'ABSENT' &&
              s.attendance !== 'EXCUSED',
          ),
        ).length
        expect(reach, `${key}:${track.activity}`).toBe(people)
        expect(reach ?? 0).toBeLessThanOrEqual(facts(key).length)
        const target = demoActivities[key].find((a) => a.key === track.activity)?.target ?? 0
        expect(reach ?? 0, `${key}:${track.activity} target`).toBeLessThanOrEqual(target)
      }
  })

  it('lands every completion outcome that names a stage on a terminal stage', () => {
    for (const outcome of outcomes.filter((o) => o.eventType === 'COMPLETION' && o.stage)) {
      const stage = journeyStages[outcome.project]?.find((s) => s.code === outcome.stage)
      expect(stage?.terminal, `${outcome.project}:${outcome.stage}`).toBe(true)
    }
  })

  it('counts the cleanly imported people as enrolled and attending', () => {
    expect(cohortPeople('CRL', today).length).toBe(demoCohorts.CRL.count + 12)
    expect(cohortPeople('ALS', today).length).toBe(demoCohorts.ALS.count + 6)
    const imported = facts('ALS').filter((who) => who.ordinal >= 1000)
    expect(imported.some((who) => planSessions('ALS', who, today).length > 0)).toBe(true)
  })

  it('keeps stages in order across a retry that already stored part of the plan', () => {
    for (const key of keys)
      for (const who of facts(key)) {
        const planned = planSessions(key, who, today)
        const key2 = (s: (typeof planned)[number]) => `${s.track}|${s.date}`
        const stored = new Set(planned.slice(0, Math.ceil(planned.length / 2)).map(key2))
        const retried = pendingSessions(planSessions(key, who, today), stored, key2)
        const all = [...planned.filter((s) => stored.has(key2(s))), ...retried]
        expect(new Set(all.map(key2)).size).toBe(all.length)
        const order = all.map((s) => s.track)
        expect(order).toEqual([...order].sort((a, b) => a - b))
      }
  })

  it('would restart a person at the first track if the plan were rebuilt after the writes', () => {
    const who = facts('SSG').find((f) => planSessions('SSG', f, today).some((s) => s.track >= 2))
    expect(who).toBeDefined()
    const planned = planSessions('SSG', who as EnrollmentFact, today)
    const after = planned[planned.length - 1].date
    const rebuilt = planSessions('SSG', { ...(who as EnrollmentFact), after }, today)
    expect(rebuilt.length === 0 || rebuilt[0].track <= planned[planned.length - 1].track).toBe(true)
  })
})

describe('journey records retry snapshot', () => {
  const stub = (written: number, latest: Date) => {
    const groupBy = vi.fn().mockResolvedValue([{ enrollmentId: 'e1', _max: { eventDate: latest } }])
    const count = vi.fn().mockResolvedValue(written)
    const ctx = {
      owner: { beneficiaryActivityParticipation: { count }, beneficiaryJourneyEvent: { groupBy } },
    }
    return { ctx: ctx as never, groupBy }
  }

  it('returns the first snapshot on a retry even after later events were written', async () => {
    const { ctx, groupBy } = stub(0, new Date('2026-08-01T00:00:00.000Z'))
    const first = await firstRunLatest(ctx, 'p1')
    groupBy.mockResolvedValue([{ enrollmentId: 'e1', _max: { eventDate: new Date('2026-10-01') } }])
    const retry = await firstRunLatest(ctx, 'p1')
    expect(retry).toBe(first)
    expect(retry.get('e1')).toBe('2026-08-01')
    expect(groupBy).toHaveBeenCalledTimes(1)
  })

  it('refuses a fresh process that finds this stage notes already stored', async () => {
    const { ctx } = stub(3, new Date('2026-08-01T00:00:00.000Z'))
    await expect(firstRunLatest(ctx, 'p2')).rejects.toThrow(/reset the database and rerun/)
  })
})
