import { addDaysIso, attendanceFields, demoActivities, demoProjects } from './local-demo-data'
import {
  type EnrollmentFact,
  type Session,
  crlBranches,
  journeyTracks,
  mix,
  planSessions,
  planTests,
} from './local-demo-journeys'
import type { DemoContext } from './local-demo-seed'
import { activityCode } from './local-demo-stage-activities'
import { attendanceForms, createAndPublish } from './local-demo-stage-forms'
import { projectOf } from './local-demo-util'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const iso = (date: Date) => date.toISOString().slice(0, 10)
const chunks = <T>(rows: T[], size = 500) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, i * size + size),
  )

type Row = Record<string, unknown>

/** Publishes an attendance form for every stage-mapped activity that has no form yet. */
async function ensureForms(ctx: DemoContext, project: (typeof demoProjects)[number]) {
  const projectId = projectOf(ctx, project.key)
  for (const track of journeyTracks[project.key] ?? []) {
    if (!track.stage || attendanceForms[project.key]?.activityKey === track.activity) continue
    const index = demoActivities[project.key].findIndex((a) => a.key === track.activity)
    const activity = await ctx.owner.projectActivity.findFirstOrThrow({
      where: { projectId, code: activityCode(project, index) },
      select: { id: true, title: true },
    })
    const stage = await ctx.owner.journeyStage.findFirstOrThrow({
      where: { projectId, code: track.stage },
      select: { id: true },
    })
    await createAndPublish(ctx, projectId, ctx.staff.me, {
      code: `${track.activity}_attendance`,
      name: `${activity.title} Attendance`,
      description: 'Records who attended each session and how each participant is progressing.',
      formType: 'ACTIVITY_MONITORING',
      activityId: activity.id,
      journeyStageId: stage.id,
      fields: attendanceFields,
    })
  }
}

/** A quarter of coached CRL participants move to a branch after coaching, a few on to savings. */
function planBranches(
  sessions: Session[],
  ordinal: number,
  today: string,
  add: (code: string, type: string, date: string, text: string) => void,
) {
  const coached = sessions.filter((session) => session.attendance !== 'ABSENT')
  if (coached.length < 3 || mix(ordinal, 9) % 4 !== 0) return
  const branchDay = addDaysIso(coached[coached.length - 1].date, 1)
  if (branchDay >= today) return
  const enterprise = mix(ordinal, 10) % 2 === 0
  add(
    enterprise ? crlBranches.first : crlBranches.second,
    'PROGRESS_UPDATE',
    branchDay,
    enterprise
      ? 'Started a household enterprise after coaching.'
      : 'Placed in a local job after coaching.',
  )
  const savingsDay = addDaysIso(branchDay, 10)
  if (mix(ordinal, 11) % 3 === 0 && savingsDay < today)
    add(crlBranches.savings, 'PROGRESS_UPDATE', savingsDay, 'Joined a savings group.')
}

/**
 * Fills every enrollment's record to match its status: attendance in the project's held
 * activities, journey events up to the current stage, and pre and post tests. Written on the
 * owner connection like the earlier test scores, because no bulk service path exists.
 */
export async function stageJourneyRecords(ctx: DemoContext) {
  const totals = { sessions: 0, events: 0, tests: 0 }
  for (const project of demoProjects) {
    const tracks = journeyTracks[project.key]
    if (!tracks) continue
    await ensureForms(ctx, project)
    const projectId = projectOf(ctx, project.key)
    const base = {
      organizationId: ctx.organizationId,
      projectId,
      recordedById: ctx.staff[project.officers[0]].userId,
    }
    const stages = new Map(
      (
        await ctx.owner.journeyStage.findMany({
          where: { projectId },
          select: { id: true, code: true, isTerminal: true },
        })
      ).map((stage) => [stage.code, stage]),
    )
    const held: string[] = []
    for (const track of tracks) {
      const index = demoActivities[project.key].findIndex((a) => a.key === track.activity)
      const row = await ctx.owner.projectActivity.findFirstOrThrow({
        where: { projectId, code: activityCode(project, index) },
        select: { id: true, status: true },
      })
      if (!['IN_PROGRESS', 'COMPLETED'].includes(row.status))
        throw new Error(`Activity ${project.key}:${track.activity} is not held (${row.status}).`)
      held.push(row.id)
    }
    const enrollments = await ctx.owner.beneficiaryProjectEnrollment.findMany({
      where: { organizationId: ctx.organizationId, projectId },
      orderBy: [{ enrollmentDate: 'asc' }, { beneficiary: { code: 'asc' } }],
      select: { id: true, status: true, enrollmentDate: true, endedDate: true },
    })
    const taken = new Set(
      (
        await ctx.owner.beneficiaryActivityParticipation.findMany({
          where: { projectId },
          select: { enrollmentId: true, activityId: true, participationDate: true },
        })
      ).map((r) => `${r.enrollmentId}|${r.activityId}|${iso(r.participationDate)}`),
    )
    const tested = new Set(
      (
        await ctx.owner.assessmentResult.findMany({
          where: { projectId, enrollmentId: { not: null } },
          select: { enrollmentId: true, type: true },
        })
      ).map((r) => `${r.enrollmentId}|${r.type}`),
    )
    const assessed = tracks.findIndex((track) => track.assessed)
    const terminal = [...stages.values()].find((stage) => stage.isTerminal)
    const participations: Row[] = []
    const events: Row[] = []
    const tests: Row[] = []

    for (const [ordinal, enrollment] of enrollments.entries()) {
      const who: EnrollmentFact = {
        ordinal,
        status: enrollment.status,
        enrollmentDate: iso(enrollment.enrollmentDate),
        endedDate: enrollment.endedDate ? iso(enrollment.endedDate) : null,
      }
      const sessions = planSessions(project.key, who, ctx.today)
      for (const session of sessions) {
        const activityId = held[session.track]
        if (taken.has(`${enrollment.id}|${activityId}|${session.date}`)) continue
        const id = ctx.stable(`journey:${enrollment.id}:${activityId}:${session.date}`)
        const text =
          session.note ??
          (session.attendance === 'ABSENT' || session.attendance === 'EXCUSED'
            ? 'Absent from the session; the officer checked on the household.'
            : 'Participated actively in the session.')
        participations.push({
          ...base,
          id,
          enrollmentId: enrollment.id,
          activityId,
          attendanceStatus: session.attendance,
          participationDate: day(session.date),
          progressStatus: session.progress,
          progressNotes: text,
          recordedAt: day(session.date),
        })
        const stage = tracks[session.track].stage
        events.push({
          ...base,
          enrollmentId: enrollment.id,
          activityId,
          stageId: stage ? stages.get(stage)?.id : null,
          participationId: id,
          eventType: session.progress === 'COMPLETED' ? 'COMPLETION' : 'PARTICIPATION',
          eventDate: day(session.date),
          description: text,
          note: session.note,
          recordedAt: day(session.date),
        })
      }
      const stageEvent = (code: string, eventType: string, date: string, description: string) => {
        const stage = stages.get(code)
        if (stage)
          events.push({
            ...base,
            enrollmentId: enrollment.id,
            stageId: stage.id,
            eventType,
            eventDate: day(date),
            description,
            recordedAt: day(date),
          })
      }
      if (enrollment.status === 'COMPLETED' && terminal && who.endedDate)
        events.push({
          ...base,
          enrollmentId: enrollment.id,
          stageId: terminal.id,
          eventType: 'COMPLETION',
          eventDate: day(who.endedDate),
          description: 'Reached the final stage of the journey.',
          recordedAt: day(who.endedDate),
        })
      if (project.key === 'CRL') planBranches(sessions, ordinal, ctx.today, stageEvent)
      for (const test of planTests(project.key, who, sessions, ctx.today)) {
        if (tested.has(`${enrollment.id}|${test.type}`)) continue
        tests.push({
          ...base,
          activityId: held[assessed],
          enrollmentId: enrollment.id,
          type: test.type,
          score: test.score,
          maximumScore: 100,
          assessmentDate: day(test.date),
        })
      }
    }
    for (const rows of chunks(participations))
      await ctx.owner.beneficiaryActivityParticipation.createMany({
        data: rows as never,
        skipDuplicates: true,
      })
    for (const rows of chunks(events))
      await ctx.owner.beneficiaryJourneyEvent.createMany({ data: rows as never })
    for (const rows of chunks(tests))
      await ctx.owner.assessmentResult.createMany({ data: rows as never })
    totals.sessions += participations.length
    totals.events += events.length
    totals.tests += tests.length
    ctx.log(
      `  ${project.code}: ${participations.length} sessions, ${events.length} events, ${tests.length} tests`,
    )
  }
  ctx.log(`  journey records written: ${JSON.stringify(totals)}`)
}
