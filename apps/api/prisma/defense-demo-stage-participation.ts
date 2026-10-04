import { planCohort } from './local-demo-data'
import { demoProjects } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { registrarFor } from './local-demo-stage-people'
import { projectOf, step } from './local-demo-util'

/** Cohort members who attend the fourth coaching session; six of twenty need follow-up, so the
 * share is 30 percent and neither side of the split is a small cell. */
export const sessionSize = 20
export const followUpPeople = [1, 4, 7, 10, 13, 16]
/** Those who also get a visit note on their journey. */
const notedPeople = [1, 4, 7, 10]

const visitNotes = [
  'Visited the household; the enterprise stock was damaged by the flood and the group will request a replacement grant.',
  'The member missed the session to care for a sick relative; the coach agreed on a catch-up date.',
  'Cash records are incomplete; the coach will repeat the bookkeeping exercise at the next visit.',
  'The household is waiting for abaca fiber supply; the coach linked the member to a nearby supplier.',
]

/** A fourth coaching session through the published attendance form, then visit notes on the
 * journeys of some members who need follow-up, all by the Project Officer. */
export async function stageDefenseParticipation(ctx: DemoContext) {
  const project = demoProjects.find((p) => p.key === 'CRL') as (typeof demoProjects)[number]
  const projectId = projectOf(ctx, 'CRL')
  const officer = registrarFor(ctx, project)
  const form = await ctx.owner.digitalForm.findFirstOrThrow({
    where: { projectId, code: 'coaching_attendance' },
    select: { id: true },
  })
  const row = await ctx.owner.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { startDate: true },
  })
  const people = planCohort(
    project,
    ctx.today,
    (row.startDate as Date).toISOString().slice(0, 10),
  ).slice(0, sessionSize)
  for (const [index, person] of people.entries()) {
    const needsFollowUp = followUpPeople.includes(index)
    const saved = (await step(`session ${person.code}`, () =>
      ctx.services.metadata.saveSubmission(officer, projectId, form.id, {
        clientSubmissionId: ctx.stable(`attendance:${project.code}:${person.code}:4`),
        values: {
          beneficiary_code: person.code,
          participation_date: ctx.today,
          attendance_status: needsFollowUp && index % 2 ? 'ABSENT' : 'PRESENT',
          progress_status: needsFollowUp ? 'NEEDS_FOLLOW_UP' : 'IN_PROGRESS',
          progress_notes: needsFollowUp
            ? 'The coach will visit the household to follow up on the enterprise.'
            : 'Participated actively in the session.',
        },
      }),
    )) as { id: string; updatedAt: string; status: string }
    if (saved.status === 'DRAFT')
      await ctx.services.metadata.submitSubmission(officer, projectId, form.id, saved.id, {
        expectedUpdatedAt: saved.updatedAt,
      })
  }

  const stages = await ctx.services.participants.listStages(officer, projectId)
  const stage = stages.find((entry) => entry.code === 'COACHING')
  if (!stage) throw new Error('Journey stage COACHING is missing for CRL.')
  let noted = 0
  for (const [position, index] of notedPeople.entries()) {
    const beneficiary = await ctx.owner.beneficiary.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, code: people[index].code },
      select: { id: true },
    })
    const event = await ctx.owner.beneficiaryJourneyEvent.findFirst({
      where: {
        projectId,
        enrollment: { beneficiaryId: beneficiary.id },
        eventType: 'FOLLOW_UP',
        correctsEventId: null,
        activityId: { not: null },
        eventDate: new Date(`${ctx.today}T00:00:00.000Z`),
      },
      select: { id: true, description: true },
    })
    if (!event) continue
    const corrected = await ctx.owner.beneficiaryJourneyEvent.findFirst({
      where: { correctsEventId: event.id },
      select: { id: true },
    })
    if (corrected) continue
    await step(`journey note ${people[index].code}`, () =>
      ctx.services.participants.correctEvent(officer, projectId, beneficiary.id, event.id, {
        eventDate: ctx.today,
        description: event.description ?? 'Follow-up needed after the coaching session.',
        reason: 'Added the visit note after the household follow-up.',
        note: visitNotes[position],
        stageId: stage.id,
      }),
    )
    noted += 1
  }
  ctx.log(`  fourth session recorded for ${people.length} members, journey notes added: ${noted}`)
}
