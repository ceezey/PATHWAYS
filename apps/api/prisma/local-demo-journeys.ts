import { type ProjectKey, addDaysIso, demoActivities, demoProjects } from './local-demo-data'

/** One activity people attend, recorded through its published attendance form inside its planned window. */
export type Track = {
  activity: string
  /** Journey stage the activity maps to; the attendance form is bound to both. */
  stage: string
  every: number
  max: number
  /** Only every nth enrollment attends, to model a later journey step. */
  share?: number
  /** Whether pre and post tests are recorded against this activity. */
  assessed?: boolean
}

export const journeyTracks: Partial<Record<ProjectKey, Track[]>> = {
  SSG: [
    { activity: 'lifeskills', stage: 'LIFESKILLS', every: 7, max: 5, assessed: true },
    { activity: 'returnedproof', stage: 'PEER-EDUCATOR', every: 7, max: 3, share: 4 },
  ],
  ALS: [{ activity: 'reviewclass', stage: 'REVIEW-CLASS', every: 7, max: 5, assessed: true }],
  CRL: [{ activity: 'livelihood', stage: 'COACHING', every: 7, max: 3, assessed: true }],
  WSH: [{ activity: 'hygiene', stage: 'HYGIENE-CLUB', every: 14, max: 5, assessed: true }],
  EHK: [{ activity: 'distribute', stage: 'KIT-DISTRIBUTION', every: 14, max: 3, assessed: true }],
}

export type EnrollmentFact = {
  /** Position in enrollment order within the project. */
  ordinal: number
  enrollmentDate: string
  endedDate: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'TRANSFERRED' | 'INACTIVE'
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

/**
 * Sessions an enrollment attended: from a week after enrollment, inside each activity window,
 * anchored at the last possible day. People who left stop a week before leaving.
 */
export function planSessions(project: ProjectKey, who: EnrollmentFact, today: string): Session[] {
  const tracks = journeyTracks[project] ?? []
  const yesterday = addDaysIso(today, -1)
  const last = who.endedDate
    ? minIso(yesterday, who.status === 'COMPLETED' ? who.endedDate : addDaysIso(who.endedDate, -7))
    : yesterday
  const sessions: Session[] = []
  for (const [index, track] of tracks.entries()) {
    if (who.ordinal % (track.share ?? 1) !== 0) continue
    const window = activityWindow(project, track.activity, today)
    const first = maxIso(addDaysIso(who.enrollmentDate, 7), window.start)
    const anchor = addDaysIso(minIso(window.end, last), -(who.ordinal % track.every))
    const dates: string[] = []
    for (
      let date = anchor;
      date >= first && dates.length < track.max;
      date = addDaysIso(date, -track.every)
    )
      dates.unshift(date)
    for (const [position, date] of dates.entries()) {
      const roll = mix(who.ordinal, index, position) % 100
      const closing = who.status === 'COMPLETED' && position === dates.length - 1
      const absent = !closing && roll >= 78
      sessions.push({
        track: index,
        date,
        attendance: closing
          ? 'COMPLETED'
          : roll < 78
            ? 'PRESENT'
            : roll < 90
              ? 'ABSENT'
              : 'EXCUSED',
        progress: closing ? 'COMPLETED' : 'IN_PROGRESS',
        note: absent ? absentNote : sessionNotes[roll % sessionNotes.length],
      })
    }
  }
  return sessions
}

export type PlannedTest = { type: 'PRE_TEST' | 'POST_TEST'; date: string; score: number }

/** Pre-test at the first session, post-test at the last one for completers only (mostly higher). */
export function planTests(who: EnrollmentFact, dates: string[]): PlannedTest[] {
  if (dates.length === 0) return []
  const pre = 38 + (mix(who.ordinal, 1) % 26)
  const tests: PlannedTest[] = [{ type: 'PRE_TEST', date: dates[0], score: pre }]
  if (who.status === 'COMPLETED' && dates.length > 1) {
    const gain = mix(who.ordinal, 2) % 10 === 0 ? -3 : 8 + (mix(who.ordinal, 3) % 20)
    tests.push({
      type: 'POST_TEST',
      date: dates[dates.length - 1],
      score: Math.min(98, pre + gain),
    })
  }
  return tests
}
