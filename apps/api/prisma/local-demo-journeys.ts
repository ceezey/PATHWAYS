import {
  type ProjectKey,
  addDaysIso,
  demoActivities,
  demoProjects,
  planCohort,
} from './local-demo-data'
import { outcomes } from './local-demo-stage-outcomes'

/** One activity people attend, recorded through its published attendance form inside its planned window. */
export type Track = {
  activity: string
  /** Journey stage the activity maps to; the attendance form is bound to both. */
  stage: string
  every: number
  /** Sessions a person attends when the schedule allows. */
  count: number
  /** Only every nth enrollment attends, to model a later journey step. */
  share?: number
  /** Branch the track sits on; each person follows one branch, split about 55 to 45. */
  branch?: 'A' | 'B'
  /** Pre-test at the first session of a pre track, post-test at the first session of a post track. */
  assess?: 'pre' | 'post'
}

/** Tracks in journey order: each starts after the previous one, so stage order follows attendance. */
export const journeyTracks: Partial<Record<ProjectKey, Track[]>> = {
  SSG: [
    { activity: 'lifeskills', stage: 'LIFESKILLS', every: 7, count: 5, assess: 'pre' },
    { activity: 'webinar', stage: 'WEBINAR', every: 7, count: 1 },
    { activity: 'entrep', stage: 'ENTREP', every: 7, count: 3, branch: 'A' },
    { activity: 'tech', stage: 'TECH', every: 7, count: 3, branch: 'B' },
    { activity: 'posttest', stage: 'POST-ASSESSMENT', every: 7, count: 1, assess: 'post' },
    { activity: 'returnedproof', stage: 'PEER-EDUCATOR', every: 7, count: 3, share: 4 },
  ],
  ALS: [
    { activity: 'reviewclass', stage: 'REVIEW-CLASS', every: 7, count: 5, assess: 'pre' },
    { activity: 'webinar', stage: 'WEBINAR', every: 7, count: 1 },
    { activity: 'entrep', stage: 'ENTREP', every: 7, count: 3, branch: 'A' },
    { activity: 'tech', stage: 'TECH', every: 7, count: 3, branch: 'B' },
    { activity: 'assessment', stage: 'ASSESSED', every: 7, count: 1, assess: 'post' },
  ],
  CRL: [{ activity: 'livelihood', stage: 'COACHING', every: 7, count: 3, assess: 'pre' }],
  WSH: [{ activity: 'hygiene', stage: 'HYGIENE-CLUB', every: 14, count: 5, assess: 'pre' }],
  EHK: [{ activity: 'distribute', stage: 'KIT-DISTRIBUTION', every: 14, count: 3, assess: 'pre' }],
}

export type EnrollmentFact = {
  /** Position in enrollment order within the project. */
  ordinal: number
  enrollmentDate: string
  endedDate: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'TRANSFERRED' | 'INACTIVE'
  /** Latest journey event already recorded, which later sessions must follow. */
  after?: string
}

export type Session = {
  track: number
  date: string
  attendance: 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'COMPLETED'
  progress: 'IN_PROGRESS' | 'COMPLETED'
  note: string
}

const absentNote = 'Absent from the session; the officer checked on the household.'
const sessionNotes = [
  'Asked to repeat the practice exercise at the next session.',
  'Arrived late because of the distance from the barangay.',
  'Shared a worked example with the group.',
  'Participated actively in the session.',
]

/** Deterministic spread so every run seeds the same attendance. */
export const mix = (...parts: number[]) =>
  Math.abs(parts.reduce((sum, part) => Math.imul(sum ^ (part + 0x9e3779b9), 0x85ebca6b) >>> 0, 17))

const minIso = (a: string, b: string) => (a < b ? a : b)
const maxIso = (a: string, b: string) => (a > b ? a : b)

/** Planned window of an activity as ISO days, cut off where the project ends. */
export function activityWindow(project: ProjectKey, key: string, today: string) {
  const activity = demoActivities[project].find((entry) => entry.key === key)
  if (!activity) throw new Error(`Unknown activity ${project}:${key}.`)
  const projectEnd = demoProjects.find((p) => p.key === project)?.endOffset ?? activity.endOffset
  return {
    start: addDaysIso(today, activity.startOffset),
    end: addDaysIso(today, Math.min(activity.endOffset, projectEnd)),
  }
}

/** Which branch a person follows: about 55 percent take the first. */
export const branchOf = (ordinal: number) => (mix(ordinal, 5) % 100 < 55 ? 'A' : 'B')

/**
 * Sessions an enrollment attended, scheduled forward from a week after enrollment: each track
 * starts a few days after the previous one inside its activity window, and the schedule stops
 * where today, the end of the project or the person leaving cuts it off. People who left stop
 * a week before leaving and never reach a post-assessment.
 */
export function planSessions(project: ProjectKey, who: EnrollmentFact, today: string): Session[] {
  const tracks = journeyTracks[project] ?? []
  const yesterday = addDaysIso(today, -1)
  const last = who.endedDate
    ? minIso(yesterday, who.status === 'COMPLETED' ? who.endedDate : addDaysIso(who.endedDate, -7))
    : yesterday
  const sessions: Session[] = []
  let cursor = maxIso(addDaysIso(who.enrollmentDate, 6), who.after ?? '')
  schedule: for (const [index, track] of tracks.entries()) {
    if (who.ordinal % (track.share ?? 1) !== 0) continue
    if (track.branch && track.branch !== branchOf(who.ordinal)) continue
    if (track.assess === 'post' && !['ACTIVE', 'COMPLETED'].includes(who.status)) break
    const window = activityWindow(project, track.activity, today)
    let date = maxIso(addDaysIso(cursor, sessions.length === 0 ? 1 : 3), window.start)
    for (let position = 0; position < track.count; position += 1) {
      if (date > minIso(window.end, last)) break schedule
      const roll = mix(who.ordinal, index, position) % 100
      sessions.push({
        track: index,
        date,
        attendance: roll < 78 ? 'PRESENT' : roll < 90 ? 'ABSENT' : 'EXCUSED',
        progress: 'IN_PROGRESS',
        note: roll >= 78 ? absentNote : sessionNotes[roll % sessionNotes.length],
      })
      cursor = date
      date = addDaysIso(date, track.every)
    }
  }
  const closing = sessions[sessions.length - 1]
  if (who.status === 'COMPLETED' && closing) {
    closing.attendance = 'COMPLETED'
    closing.progress = 'COMPLETED'
  }
  return sessions
}

export type PlannedTest = { type: 'PRE_TEST' | 'POST_TEST'; date: string; score: number }

/**
 * Pre-test at the first session of the pre track. Post-test at the first session of the post
 * track when the journey has one, otherwise at the last pre-track session of a completer.
 */
export function planTests(
  who: EnrollmentFact,
  pre: string[],
  post: string[] | null,
): PlannedTest[] {
  if (pre.length === 0) return []
  const first = 38 + (mix(who.ordinal, 1) % 26)
  const tests: PlannedTest[] = [{ type: 'PRE_TEST', date: pre[0], score: first }]
  const fallback = who.status === 'COMPLETED' && pre.length > 1 ? pre[pre.length - 1] : undefined
  const postDate = post === null ? fallback : post[0]
  if (postDate) {
    const gain = mix(who.ordinal, 2) % 10 === 0 ? -3 : 8 + (mix(who.ordinal, 3) % 20)
    tests.push({ type: 'POST_TEST', date: postDate, score: Math.min(98, first + gain) })
  }
  return tests
}

/** Project start as seeded: the base project SSG starts on a fixed date, the rest relative to the run day. */
export function projectStartIso(project: ProjectKey, today: string) {
  if (project === 'SSG') return '2026-03-03'
  const plan = demoProjects.find((p) => p.key === project)
  return addDaysIso(today, plan?.startOffset ?? 0)
}

/** What the outcomes stage will do to a cohort member later, so sessions stop before they leave. */
export function plannedFacts(project: ProjectKey, code: string, today: string) {
  const plan = demoProjects.find((p) => p.key === project)
  const index = Number(new RegExp(`^BEN-${plan?.code}-(\\d+)$`).exec(code)?.[1]) - 1
  const outcome = outcomes.find((o) => o.project === project && o.people.includes(index))
  return {
    endedDate: outcome ? addDaysIso(today, -(outcome.daysAgo ?? 0)) : null,
    status:
      outcome?.eventType === 'COMPLETION'
        ? ('COMPLETED' as const)
        : outcome?.eventType === 'DROPOUT'
          ? ('DROPPED' as const)
          : ('ACTIVE' as const),
  }
}

/** Present or completed attendance rows of one activity across the planned cohort. */
function attendanceRows(project: ProjectKey, activity: string, today: string) {
  const track = (journeyTracks[project] ?? []).findIndex((t) => t.activity === activity)
  const plan = demoProjects.find((p) => p.key === project)
  if (track < 0 || !plan) return null
  return planCohort(plan, today, projectStartIso(project, today)).flatMap((person, ordinal) =>
    planSessions(
      project,
      {
        ordinal,
        enrollmentDate: person.enrollmentDate,
        ...plannedFacts(project, person.code, today),
      },
      today,
    )
      .filter((s) => s.track === track && s.attendance !== 'ABSENT' && s.attendance !== 'EXCUSED')
      .map((s) => ({ date: s.date, person })),
  )
}

/** The latest session of an attended activity and the cohort members the seed records at it. */
export function sessionRoster(project: ProjectKey, activity: string, today: string) {
  const rows = attendanceRows(project, activity, today)
  const date = rows
    ?.map((r) => r.date)
    .sort()
    .pop()
  return rows && date
    ? { date, people: rows.filter((r) => r.date === date).map((r) => r.person) }
    : null
}

/** Distinct people the seed records as attending an activity, or null when it has no attendance. */
export function plannedReach(project: ProjectKey, activity: string, today: string) {
  const rows = attendanceRows(project, activity, today)
  return rows ? new Set(rows.map((r) => r.person.code)).size : null
}

/** Sessions still to record: a retry skips sessions already stored and so never reschedules them. */
export const pendingSessions = (
  sessions: Session[],
  stored: Set<string>,
  key: (s: Session) => string,
) => sessions.filter((s) => !stored.has(key(s)))
