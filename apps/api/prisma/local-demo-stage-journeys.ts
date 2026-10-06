import { wshPairs } from './defense-demo-stage-survey'
import { addDaysIso, demoProjects } from './local-demo-data'
import {
  type EnrollmentFact,
  journeyTracks,
  planSessions,
  planTests,
  plannedFacts,
} from './local-demo-journeys'
import type { DemoContext } from './local-demo-seed'
import { activityId as activityIdFor, attendanceForms } from './local-demo-stage-forms'
import { outcomes } from './local-demo-stage-outcomes'
import { projectOf, step } from './local-demo-util'

type Project = (typeof demoProjects)[number]

const iso = (date: Date) => date.toISOString().slice(0, 10)
const stageNotes = [
  'The coach noted steady progress and agreed on the next session date.',
  'The household asked for a follow-up visit after the session.',
  'Strong participation; the member offered to help other learners.',
]

/** Cohort members keep their registration index so rosters and sessions agree; imports follow them. */
const cohortOrdinal = (project: Project, code: string, position: number) => {
  const index = Number(new RegExp(`^BEN-${project.code}-(\\d+)$`).exec(code)?.[1]) - 1
  return Number.isInteger(index) && index >= 0 ? index : 1000 + position
}

/**
 * Records attendance through each activity's published attendance form, in the order the product
 * requires: stages, mappings and forms already exist, then a submission per session (which writes
 * the participation and the staged journey event), then a few visit notes as event corrections.
 * Runs before the outcomes stage because only active enrollments accept attendance.
 */
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
  const latest = new Map(
    (
      await ctx.owner.beneficiaryJourneyEvent.groupBy({
        by: ['enrollmentId'],
        where: { projectId },
        _max: { eventDate: true },
      })
    ).map((row) => [row.enrollmentId, row._max.eventDate ? iso(row._max.eventDate) : '']),
  )
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
  for (const [position, enrollment] of enrollments.entries()) {
    const code = enrollment.beneficiary.code
    const ordinal = cohortOrdinal(project, code, position)
    const who: EnrollmentFact = {
      ordinal,
      enrollmentDate: iso(enrollment.enrollmentDate),
      after: latest.get(enrollment.id) || undefined,
      ...plannedFacts(project.key, code, ctx.today),
    }
    const sessions = planSessions(project.key, who, ctx.today)
      .filter((s) => !taken.has(`${enrollment.id}|${activityIds[s.track]}|${s.date}`))
      .sort((a, b) => a.date.localeCompare(b.date))
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
      if (event) {
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
  await Promise.all(
    demoProjects.filter((p) => journeyTracks[p.key]).map((project) => recordProject(ctx, project)),
  )
}

/**
 * Pre and post tests tied to attendance. No service writes assessment results, so the rows go in
 * on the owner connection, but each references the validated attendance submission of the same
 * enrollment and activity, which the database guards require. Pre-test is the first session,
 * post-test the last one for completers (and the closed WSH survey period pairs).
 */
export async function stageAssessments(ctx: DemoContext) {
  let written = 0
  for (const project of demoProjects) {
    const tracks = journeyTracks[project.key] ?? []
    const pre = tracks.findIndex((track) => track.assess === 'pre')
    const post = tracks.findIndex((track) => track.assess === 'post')
    if (pre < 0) continue
    const projectId = projectOf(ctx, project.key)
    if ((await ctx.owner.assessmentResult.count({ where: { projectId } })) > 0) continue
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
        ordinal: cohortOrdinal(project, enrollment.beneficiary.code, position),
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
