import { wshPairs } from './defense-demo-stage-survey'
import { addDaysIso, demoProjects } from './local-demo-data'
import { type EnrollmentFact, journeyTracks, planSessions, planTests } from './local-demo-journeys'
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

/** What the outcomes stage will do to a cohort member later, so sessions stop before they leave. */
function plannedFacts(project: Project, code: string, today: string) {
  const index = Number(new RegExp(`^BEN-${project.code}-(\\d+)$`).exec(code)?.[1]) - 1
  const outcome = outcomes.find((o) => o.project === project.key && o.people.includes(index))
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
  for (const [ordinal, enrollment] of enrollments.entries()) {
    const code = enrollment.beneficiary.code
    const who: EnrollmentFact = {
      ordinal,
      enrollmentDate: iso(enrollment.enrollmentDate),
      ...plannedFacts(project, code, ctx.today),
    }
    const after = latest.get(enrollment.id) ?? ''
    const sessions = planSessions(project.key, who, ctx.today)
      .filter(
        (s) => s.date > after && !taken.has(`${enrollment.id}|${activityIds[s.track]}|${s.date}`),
      )
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
    const tracks = journeyTracks[project.key]
    const assessed = tracks?.findIndex((track) => track.assessed) ?? -1
    if (!tracks || assessed < 0) continue
    const projectId = projectOf(ctx, project.key)
    if ((await ctx.owner.assessmentResult.count({ where: { projectId } })) > 0) continue
    const activityId = await activityIdFor(ctx, project, tracks[assessed].activity)
    const enrollments = await ctx.owner.beneficiaryProjectEnrollment.findMany({
      where: { organizationId: ctx.organizationId, projectId },
      orderBy: [{ enrollmentDate: 'asc' }, { beneficiary: { code: 'asc' } }],
      select: {
        id: true,
        status: true,
        enrollmentDate: true,
        endedDate: true,
        beneficiaryActivityParticipation_enrollment: {
          where: { activityId, sourceSubmissionId: { not: null } },
          orderBy: { participationDate: 'asc' },
          select: { participationDate: true, sourceSubmissionId: true },
        },
      },
    })
    let paired = 0
    for (const [ordinal, enrollment] of enrollments.entries()) {
      const own = enrollment.beneficiaryActivityParticipation_enrollment
      const who: EnrollmentFact = {
        ordinal,
        status: enrollment.status,
        enrollmentDate: iso(enrollment.enrollmentDate),
        endedDate: enrollment.endedDate ? iso(enrollment.endedDate) : null,
      }
      // WSH is past its end date: the first eight learners complete the closed-period survey pair.
      const pair = project.key === 'WSH' && own.length > 1 && paired < wshPairs.length
      const planned = planTests(
        pair ? { ...who, status: 'COMPLETED' } : who,
        own.map((p) => iso(p.participationDate)),
      )
      if (pair) {
        planned[0].score = wshPairs[paired].pre
        planned[1].score = wshPairs[paired].post
        paired += 1
      }
      for (const test of planned) {
        const source = test.type === 'PRE_TEST' ? own[0] : own[own.length - 1]
        await ctx.owner.assessmentResult.create({
          data: {
            organizationId: ctx.organizationId,
            projectId,
            activityId,
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
