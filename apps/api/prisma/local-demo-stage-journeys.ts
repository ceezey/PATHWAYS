import { wshPairs } from './defense-demo-stage-survey'
import { demoProjects } from './local-demo-data'
import {
  type EnrollmentFact,
  cohortPeople,
  journeyTracks,
  pendingSessions,
  planSessions,
  planTests,
  plannedFacts,
  stageNoteMarkers,
} from './local-demo-journeys'
import type { DemoContext } from './local-demo-seed'
import { activityId as activityIdFor, attendanceForms } from './local-demo-stage-forms'
import { projectOf, step } from './local-demo-util'

type Project = (typeof demoProjects)[number]

const iso = (date: Date) => date.toISOString().slice(0, 10)
const stageNotes = [
  'The coach noted steady progress and agreed on the next session date.',
  'The household asked for a follow-up visit after the session.',
  'Strong participation; the member offered to help other learners.',
]

/** Cached per context so an in-process retry reuses the first plan; a fresh process on written data is refused. */
const firstRun = new WeakMap<DemoContext, Map<string, Map<string, string>>>()

export async function firstRunLatest(ctx: DemoContext, projectId: string) {
  const byProject = firstRun.get(ctx) ?? new Map<string, Map<string, string>>()
  firstRun.set(ctx, byProject)
  const known = byProject.get(projectId)
  if (known) return known
  const written = await ctx.owner.beneficiaryActivityParticipation.count({
    where: { projectId, progressNotes: { in: stageNoteMarkers } },
  })
  if (written > 0)
    throw new Error(
      'Journey records already exist for this project; reset the database and rerun the seed instead of rescheduling.',
    )
  const rows = await ctx.owner.beneficiaryJourneyEvent.groupBy({
    by: ['enrollmentId'],
    where: { projectId },
    _max: { eventDate: true },
  })
  const latest = new Map(
    rows.map((r) => [r.enrollmentId, r._max.eventDate ? iso(r._max.eventDate) : '']),
  )
  byProject.set(projectId, latest)
  return latest
}

/** Everyone keeps the ordinal the planner gave them, so rosters and recorded sessions agree. */
const ordinalOf = (project: Project, today: string) => {
  const known = new Map(cohortPeople(project.key, today).map((p) => [p.person.code, p.ordinal]))
  return (code: string, position: number) => known.get(code) ?? 1000 + position
}

/** Records attendance through each activity's published form (submission, participation, staged event), then a few visit notes. */
async function recordProject(ctx: DemoContext, project: Project) {
  const tracks = journeyTracks[project.key] ?? []
  const projectId = projectOf(ctx, project.key)
  const officer = ctx.staff[project.officers[0]].identity
  const formIds: string[] = []
  const activityIds: string[] = []
  for (const track of tracks) {
    const spec = (attendanceForms[project.key] ?? []).find((s) => s.activityKey === track.activity)
    if (!spec) throw new Error(`No attendance form for ${project.key}:${track.activity}.`)
    formIds.push(
      (
        await ctx.owner.digitalForm.findFirstOrThrow({
          where: { projectId, code: spec.code, status: 'PUBLISHED' },
          select: { id: true },
        })
      ).id,
    )
    activityIds.push(await activityIdFor(ctx, project, track.activity))
  }
  const enrollments = await ctx.owner.beneficiaryProjectEnrollment.findMany({
    where: { organizationId: ctx.organizationId, projectId, status: 'ACTIVE' },
    orderBy: [{ enrollmentDate: 'asc' }, { beneficiary: { code: 'asc' } }],
    select: {
      id: true,
      beneficiaryId: true,
      enrollmentDate: true,
      beneficiary: { select: { code: true } },
    },
  })
  const latest = await firstRunLatest(ctx, projectId)
  const taken = new Set(
    (
      await ctx.owner.beneficiaryActivityParticipation.findMany({
        where: { projectId },
        select: { enrollmentId: true, activityId: true, participationDate: true },
      })
    ).map((r) => `${r.enrollmentId}|${r.activityId}|${iso(r.participationDate)}`),
  )
  let recorded = 0
  let noted = 0
  const ordinals = ordinalOf(project, ctx.today)
  for (const [position, enrollment] of enrollments.entries()) {
    const code = enrollment.beneficiary.code
    const ordinal = ordinals(code, position)
    const who: EnrollmentFact = {
      ordinal,
      enrollmentDate: iso(enrollment.enrollmentDate),
      after: latest.get(enrollment.id) || undefined,
      ...plannedFacts(project.key, code, ctx.today),
    }
    const sessions = pendingSessions(
      planSessions(project.key, who, ctx.today),
      taken,
      (s) => `${enrollment.id}|${activityIds[s.track]}|${s.date}`,
    ).sort((a, b) => a.date.localeCompare(b.date))
    for (const session of sessions) {
      const formId = formIds[session.track]
      const saved = (await step(`session ${code} ${session.date}`, () =>
        ctx.services.metadata.saveSubmission(officer, projectId, formId, {
          clientSubmissionId: ctx.stable(
            `journey:${project.code}:${code}:${session.track}:${session.date}`,
          ),
          values: {
            beneficiary_code: code,
            participation_date: session.date,
            attendance_status: session.attendance,
            progress_status: session.progress,
            progress_notes: session.note,
          },
        }),
      )) as { id: string; updatedAt: string; status: string }
      if (saved.status === 'DRAFT')
        await ctx.services.metadata.submitSubmission(officer, projectId, formId, saved.id, {
          expectedUpdatedAt: saved.updatedAt,
        })
      recorded += 1
    }
    if (
      who.status === 'ACTIVE' &&
      sessions.length >= 2 &&
      ordinal % 9 === 4 &&
      project.key !== 'EHK'
    ) {
      const event = await ctx.owner.beneficiaryJourneyEvent.findFirst({
        where: {
          enrollmentId: enrollment.id,
          correctsEventId: null,
          activityId: { not: null },
        },
        orderBy: [{ eventDate: 'desc' }, { recordedAt: 'desc' }],
        select: { id: true, eventDate: true, description: true, stageId: true },
      })
      const corrected =
        event &&
        (await ctx.owner.beneficiaryJourneyEvent.count({ where: { correctsEventId: event.id } }))
      if (event && !corrected) {
        await step(`journey note ${code}`, () =>
          ctx.services.participants.correctEvent(
            officer,
            projectId,
            enrollment.beneficiaryId,
            event.id,
            {
              eventDate: iso(event.eventDate),
              description: event.description ?? 'Participated in the session.',
              reason: 'Added the coach note after the household visit.',
              note: stageNotes[ordinal % stageNotes.length],
              stageId: event.stageId ?? undefined,
            },
          ),
        )
        noted += 1
      }
    }
  }
  ctx.log(`  ${project.code}: ${recorded} sessions through forms, ${noted} journey notes`)
}

/** Attendance for every project that defines journey tracks, projects in parallel. */
export async function stageJourneyRecords(ctx: DemoContext) {
  const runs = await Promise.allSettled(
    demoProjects.filter((p) => journeyTracks[p.key]).map((project) => recordProject(ctx, project)),
  )
  const failed = runs.filter((run): run is PromiseRejectedResult => run.status === 'rejected')
  if (failed.length) throw new Error(failed.map((run) => String(run.reason)).join('; '))
}

/** Pre and post tests on the owner connection (no service writes them), each sourced from a validated attendance submission of the same enrollment and activity. */
export async function stageAssessments(ctx: DemoContext) {
  let written = 0
  for (const project of demoProjects) {
    const tracks = journeyTracks[project.key] ?? []
    const pre = tracks.findIndex((track) => track.assess === 'pre')
    const post = tracks.findIndex((track) => track.assess === 'post')
    if (pre < 0) continue
    const ordinals = ordinalOf(project, ctx.today)
    const projectId = projectOf(ctx, project.key)
    const recorded = new Set(
      (
        await ctx.owner.assessmentResult.findMany({
          where: { projectId },
          select: { enrollmentId: true, type: true },
        })
      ).map((r) => `${r.enrollmentId}|${r.type}`),
    )
    const activities = {
      pre: await activityIdFor(ctx, project, tracks[pre].activity),
      post: post >= 0 ? await activityIdFor(ctx, project, tracks[post].activity) : null,
    }
    const enrollments = await ctx.owner.beneficiaryProjectEnrollment.findMany({
      where: { organizationId: ctx.organizationId, projectId },
      orderBy: [{ enrollmentDate: 'asc' }, { beneficiary: { code: 'asc' } }],
      select: {
        id: true,
        status: true,
        enrollmentDate: true,
        endedDate: true,
        beneficiary: { select: { code: true } },
        beneficiaryActivityParticipation_enrollment: {
          where: { sourceSubmissionId: { not: null } },
          orderBy: { participationDate: 'asc' },
          select: { activityId: true, participationDate: true, sourceSubmissionId: true },
        },
      },
    })
    let paired = 0
    for (const [position, enrollment] of enrollments.entries()) {
      const rows = enrollment.beneficiaryActivityParticipation_enrollment
      const preRows = rows.filter((r) => r.activityId === activities.pre)
      const postRows = activities.post ? rows.filter((r) => r.activityId === activities.post) : null
      const who: EnrollmentFact = {
        ordinal: ordinals(enrollment.beneficiary.code, position),
        status: enrollment.status,
        enrollmentDate: iso(enrollment.enrollmentDate),
        endedDate: enrollment.endedDate ? iso(enrollment.endedDate) : null,
      }
      // WSH is past its end date: the first eight learners complete the closed-period survey pair.
      const pair = project.key === 'WSH' && preRows.length > 1 && paired < wshPairs.length
      const planned = planTests(
        pair ? { ...who, status: 'COMPLETED' } : who,
        preRows.map((r) => iso(r.participationDate)),
        postRows?.map((r) => iso(r.participationDate)) ?? null,
      )
      if (pair) {
        planned[0].score = wshPairs[paired].pre
        planned[1].score = wshPairs[paired].post
        paired += 1
      }
      for (const test of planned) {
        if (recorded.has(`${enrollment.id}|${test.type}`)) continue
        const isPre = test.type === 'PRE_TEST'
        const source = isPre ? preRows[0] : postRows ? postRows[0] : preRows[preRows.length - 1]
        await ctx.owner.assessmentResult.create({
          data: {
            organizationId: ctx.organizationId,
            projectId,
            activityId: isPre || !activities.post ? activities.pre : activities.post,
            enrollmentId: enrollment.id,
            sourceSubmissionId: source.sourceSubmissionId,
            type: test.type,
            score: test.score,
            maximumScore: 100,
            assessmentDate: new Date(`${test.date}T00:00:00.000Z`),
            recordedById: ctx.staff.me.userId,
          },
        })
        written += 1
      }
    }
  }
  ctx.log(`  assessment results written: ${written}`)
}
