import { type ProjectKey, addDaysIso, demoActivities } from './local-demo-data'

/** One activity people attend, recorded as weekly or fortnightly sessions inside its planned window. */
export type Track = {
  activity: string
  /** Journey stage the sessions belong to; none when the activity maps to no stage. */
  stage?: string
  every: number
  max: number
  /** Only every nth enrollment attends, to model a later journey step. */
  share?: number
  /** Whether pre and post tests are recorded against this activity. */
  assessed?: boolean
}

export const journeyTracks: Partial<Record<ProjectKey, Track[]>> = {
  SSG: [
    { activity: 'lifeskills', stage: 'LIFESKILLS', every: 7, max: 8, assessed: true },
    { activity: 'returnedproof', stage: 'PEER-EDUCATOR', every: 7, max: 4, share: 4 },
  ],
  ALS: [
    { activity: 'sessions', every: 14, max: 8 },
    { activity: 'reviewclass', stage: 'REVIEW-CLASS', every: 7, max: 8, assessed: true },
  ],
  CRL: [{ activity: 'livelihood', stage: 'COACHING', every: 7, max: 4, assessed: true }],
  WSH: [{ activity: 'hygiene', stage: 'HYGIENE-CLUB', every: 14, max: 10 }],
  EHK: [{ activity: 'distribute', every: 14, max: 6, assessed: true }],
}

/** Branch and follow-up stages some coached CRL participants reach after coaching. */
export const crlBranches = { first: 'ENTERPRISE', second: 'WAGE-JOB', savings: 'SAVINGS' }

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
  note: string | null
}

const sessionNotes = [
  'Asked to repeat the practice exercise at the next session.',
  'Arrived late because of the distance from the barangay.',
  'Shared a worked example with the group.',
  'The coach agreed to a catch-up date after the missed session.',
]

/** Deterministic spread so every run seeds the same attendance. */
export const mix = (...parts: number[]) =>
  Math.abs(parts.reduce((sum, part) => Math.imul(sum ^ (part + 0x9e3779b9), 0x85ebca6b) >>> 0, 17))

const minIso = (a: string, b: string) => (a < b ? a : b)
const maxIso = (a: string, b: string) => (a > b ? a : b)

/** Planned window of an activity as ISO days. */
export function activityWindow(project: ProjectKey, key: string, today: string) {
  const activity = demoActivities[project].find((entry) => entry.key === key)
  if (!activity) throw new Error(`Unknown activity ${project}:${key}.`)
  return {
    start: addDaysIso(today, activity.startOffset),
    end: addDaysIso(today, activity.endOffset),
  }
}

/**
 * Sessions an enrollment attended: from a week after enrollment, inside each activity window,
 * newest first anchored at the last possible day. People who left stop a week before leaving.
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
        note: roll % 11 === 0 ? sessionNotes[roll % sessionNotes.length] : null,
      })
    }
  }
  return sessions
}

export type PlannedTest = { type: 'PRE_TEST' | 'POST_TEST'; date: string; score: number }

/** Pre-test for people who started the assessed activity, post-test only for completers (mostly higher). */
export function planTests(
  project: ProjectKey,
  who: EnrollmentFact,
  sessions: Session[],
  today: string,
): PlannedTest[] {
  const tracks = journeyTracks[project] ?? []
  const assessed = tracks.findIndex((track) => track.assessed)
  if (assessed < 0) return []
  const own = sessions.filter((session) => session.track === assessed)
  if (own.length === 0) return []
  const pre = 38 + (mix(who.ordinal, 1) % 26)
  const tests: PlannedTest[] = [{ type: 'PRE_TEST', date: own[0].date, score: pre }]
  if (who.status === 'COMPLETED') {
    const gain = mix(who.ordinal, 2) % 10 === 0 ? -3 : 8 + (mix(who.ordinal, 3) % 20)
    const date = minIso(addDaysIso(today, -1), who.endedDate ?? today)
    tests.push({
      type: 'POST_TEST',
      date: maxIso(date, own[0].date),
      score: Math.min(98, pre + gain),
    })
  }
  return tests
}
