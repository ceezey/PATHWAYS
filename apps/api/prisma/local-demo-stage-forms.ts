import type { FormFieldDto } from '../src/modules/metadata/metadata.dto'
import {
  addDaysIso,
  demoActivities,
  demoProjects,
  planCohort,
  type DemoProject,
  type ProjectKey,
} from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { activityCode } from './local-demo-stage-activities'
import { registrarFor } from './local-demo-stage-people'
import { projectOf, step } from './local-demo-util'

const field = (
  code: string,
  label: string,
  dataType: FormFieldDto['dataType'],
  patch: Partial<FormFieldDto> = {},
): FormFieldDto => ({
  code,
  label,
  dataType,
  required: false,
  metadataKey: false,
  sadddField: false,
  ...patch,
})

/** Household Profile: the published form the household follow-up import file maps to. */
export const householdProfileFields: FormFieldDto[] = [
  field('beneficiary_code', 'Beneficiary code', 'TEXT', { required: true, metadataKey: true }),
  field('household_size', 'Household size', 'INTEGER', {
    required: true,
    minimumValue: '1',
    maximumValue: '30',
  }),
  field('children_in_school', 'Children in school', 'INTEGER', {
    minimumValue: '0',
    maximumValue: '20',
  }),
  field('main_income_source', 'Main income source', 'SELECT', {
    required: true,
    allowedValues: ['Farming', 'Fishing', 'Small business', 'Wage labor', 'Remittances', 'Other'],
  }),
  field('monthly_income_range', 'Monthly income range', 'SELECT', {
    allowedValues: ['Below 5,000', '5,000 to 9,999', '10,000 to 14,999', '15,000 and above'],
  }),
  field('has_toilet', 'Has toilet', 'BOOLEAN'),
  field('visit_date', 'Visit date', 'DATE', { required: true }),
  field('remarks', 'Remarks', 'LONG_TEXT', { maximumLength: 2000 }),
]

export const attendanceFields: FormFieldDto[] = [
  field('beneficiary_code', 'Beneficiary code', 'TEXT', { required: true, metadataKey: true }),
  field('participation_date', 'Participation date', 'DATE', { required: true }),
  field('attendance_status', 'Attendance status', 'SELECT', {
    required: true,
    allowedValues: ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'],
  }),
  field('progress_status', 'Progress status', 'SELECT', {
    required: true,
    allowedValues: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP'],
  }),
  field('progress_notes', 'Progress notes', 'LONG_TEXT', { maximumLength: 2000 }),
]

type StageSpec = {
  code: string
  name: string
  order: number
  type: 'ENTRY' | 'CORE' | 'BRANCH' | 'FOLLOW_UP'
  terminal?: boolean
  description: string
  activityKeys: string[]
}

const journeyStages: Partial<Record<ProjectKey, StageSpec[]>> = {
  SSG: [
    { code: 'ENROLLED', name: 'Enrolled in the program', order: 1, type: 'ENTRY', description: 'Girl registered and consent recorded.', activityKeys: [] },
    { code: 'LIFESKILLS', name: 'Life skills and leadership sessions', order: 2, type: 'CORE', description: 'Weekly sessions in partner schools.', activityKeys: ['lifeskills'] },
    { code: 'PEER-EDUCATOR', name: 'Peer educator training', order: 3, type: 'CORE', description: 'Senior high school peer educators.', activityKeys: ['returnedproof'] },
    { code: 'FOLLOW-UP', name: 'Follow-up and referral support', order: 4, type: 'FOLLOW_UP', description: 'Girls who need additional support.', activityKeys: [] },
    { code: 'COMPLETED', name: 'Completed the program', order: 5, type: 'CORE', terminal: true, description: 'Finished all sessions.', activityKeys: [] },
  ],
  ALS: [
    { code: 'ENROLLED', name: 'Enrolled in a learning center', order: 1, type: 'ENTRY', description: 'Learner enrolled.', activityKeys: [] },
    { code: 'REVIEW-CLASS', name: 'Exam review classes', order: 2, type: 'CORE', description: 'Review before the assessment.', activityKeys: ['reviewclass'] },
    { code: 'ASSESSED', name: 'Took the accreditation assessment', order: 3, type: 'CORE', terminal: true, description: 'Assessment completed.', activityKeys: [] },
  ],
  CRL: [
    { code: 'ENROLLED', name: 'Enrolled as a livelihood participant', order: 1, type: 'ENTRY', description: 'Household participant registered.', activityKeys: [] },
    { code: 'COACHING', name: 'Livelihood coaching', order: 2, type: 'CORE', description: 'Coaching for household enterprises.', activityKeys: ['livelihood'] },
    { code: 'SAVINGS', name: 'Savings group member', order: 3, type: 'FOLLOW_UP', terminal: true, description: 'Joined a savings group.', activityKeys: [] },
  ],
}

const attendanceForms: Partial<Record<ProjectKey, { code: string; name: string; activityKey: string; stageCode: string }>> = {
  SSG: { code: 'lifeskills_attendance', name: 'Life Skills Session Attendance', activityKey: 'lifeskills', stageCode: 'LIFESKILLS' },
  ALS: { code: 'review_class_attendance', name: 'Review Class Attendance', activityKey: 'reviewclass', stageCode: 'REVIEW-CLASS' },
  CRL: { code: 'coaching_attendance', name: 'Livelihood Coaching Attendance', activityKey: 'livelihood', stageCode: 'COACHING' },
}

async function activityId(ctx: DemoContext, project: DemoProject, key: string) {
  const index = demoActivities[project.key].findIndex((a) => a.key === key)
  const row = await ctx.owner.projectActivity.findFirstOrThrow({
    where: { projectId: projectOf(ctx, project.key), code: activityCode(project, index) },
    select: { id: true },
  })
  return row.id
}

/** Creates a form as the author (Monitoring and Evaluation Officer or Project Officer), then has
 * the System Administrator publish it, because an author cannot publish their own form. */
async function createAndPublish(
  ctx: DemoContext,
  projectId: string,
  author: DemoContext['staff']['me'],
  input: Parameters<DemoContext['services']['metadata']['createForm']>[2],
) {
  const existing = await ctx.owner.digitalForm.findFirst({
    where: { organizationId: ctx.organizationId, projectId, code: input.code },
    select: { id: true },
  })
  if (existing) return existing.id
  const draft = (await ctx.services.metadata.createForm(author.identity, projectId, input)) as {
    id: string
    updatedAt: string
  }
  await ctx.services.metadata.publishForm(ctx.staff.admin.identity, projectId, draft.id, {
    expectedUpdatedAt: draft.updatedAt,
  })
  return draft.id
}

export async function stageJourneysAndForms(ctx: DemoContext) {
  const me = ctx.staff.me
  for (const project of demoProjects) {
    const specs = journeyStages[project.key]
    if (!specs) continue
    const projectId = projectOf(ctx, project.key)
    const existing = await ctx.services.participants.listStages(me.identity, projectId)
    if (existing.length === 0) {
      const stages: Array<{
        code: string
        name: string
        order: number
        type: StageSpec['type']
        terminal: boolean
        description: string
        mappedActivityIds: string[]
      }> = []
      for (const spec of specs) {
        const mapped: string[] = []
        for (const key of spec.activityKeys) mapped.push(await activityId(ctx, project, key))
        stages.push({
          code: spec.code,
          name: spec.name,
          order: spec.order,
          type: spec.type,
          terminal: spec.terminal ?? false,
          description: spec.description,
          mappedActivityIds: mapped,
        })
      }
      await step(`journey stages ${project.code}`, () =>
        ctx.services.participants.saveStages(me.identity, projectId, { stages }),
      )
    }
  }

  for (const project of demoProjects) {
    const spec = attendanceForms[project.key]
    if (!spec) continue
    const projectId = projectOf(ctx, project.key)
    const stages = await ctx.services.participants.listStages(me.identity, projectId)
    const stage = stages.find((entry) => entry.code === spec.stageCode)
    if (!stage) throw new Error(`Journey stage ${spec.stageCode} is missing for ${project.code}.`)
    const boundActivityId = await activityId(ctx, project, spec.activityKey)
    await step(`attendance form ${project.code}`, () =>
      createAndPublish(ctx, projectId, me, {
      code: spec.code,
      name: spec.name,
      description: 'Records who attended each session and how each participant is progressing.',
      formType: 'ACTIVITY_MONITORING',
      activityId: boundActivityId,
      journeyStageId: stage.id,
      fields: attendanceFields,
    }))
  }

  const ssg = projectOf(ctx, 'SSG')
  await step('household form', () => createAndPublish(ctx, ssg, me, {
    code: 'household_profile',
    name: 'Household Profile Update',
    description: 'Household composition and income profile collected during follow-up visits.',
    formType: 'OTHER',
    fields: householdProfileFields,
  }))
  const feedbackCode = 'committee_training_feedback'
  let feedbackId = (
    await ctx.owner.digitalForm.findFirst({ where: { projectId: ssg, code: feedbackCode }, select: { id: true } })
  )?.id
  if (!feedbackId) {
    const generated = (await step('generate feedback form', () => ctx.services.metadata.generateForm(ctx.staff.me.identity, ssg, {
      templateKey: 'training_survey',
      code: feedbackCode,
      name: 'Committee Training Feedback',
    }))) as { id: string; updatedAt: string }
    await ctx.services.metadata.publishForm(ctx.staff.admin.identity, ssg, generated.id, {
      expectedUpdatedAt: generated.updatedAt,
    })
    feedbackId = generated.id
    const comments = [
      'The case handling exercises were practical and easy to follow.',
      'More time for role play would help the committee members.',
      'The referral flowchart is useful for our school.',
      'Please schedule the next day earlier so that teachers can attend.',
      'Very clear explanation of the reporting steps.',
      'The venue was too warm but the facilitators were excellent.',
    ]
    for (const [index, comment] of comments.entries())
      await submitOne(ctx, ssg, feedbackId, ctx.staff.liza.identity, `feedback:${index}`, {
        session_date: addDaysIso(ctx.today, -12 - index),
        overall_rating: 3 + (index % 3),
        comments: comment,
      })
  }
}

async function submitOne(
  ctx: DemoContext,
  projectId: string,
  formId: string,
  identity: DemoContext['staff']['me']['identity'],
  key: string,
  values: Record<string, unknown>,
) {
  const saved = (await ctx.services.metadata.saveSubmission(identity, projectId, formId, {
    clientSubmissionId: ctx.stable(key),
    values,
  })) as { id: string; updatedAt: string; status: string }
  if (saved.status === 'DRAFT')
    await ctx.services.metadata.submitSubmission(identity, projectId, formId, saved.id, {
      expectedUpdatedAt: saved.updatedAt,
    })
}

/** Records session attendance for the first learners of each project through the published
 * attendance forms, which also writes the participation and journey history. */
export async function stageParticipation(ctx: DemoContext) {
  let recorded = 0
  for (const project of demoProjects) {
    const spec = attendanceForms[project.key]
    if (!spec) continue
    const projectId = projectOf(ctx, project.key)
    const registrar = registrarFor(ctx, project)
    const form = await ctx.owner.digitalForm.findFirstOrThrow({
      where: { projectId, code: spec.code },
      select: { id: true },
    })
    const row = await ctx.owner.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { startDate: true },
    })
    const people = planCohort(project, ctx.today, (row.startDate as Date).toISOString().slice(0, 10))
    for (const [index, person] of people.slice(0, 14).entries()) {
      for (const session of [1, 2, 3]) {
        const date = addDaysIso(person.enrollmentDate, session * 7)
        if (date >= ctx.today) continue
        const absent = (index + session) % 6 === 0
        const done = session === 3 && index % 3 === 0
        const saved = (await ctx.services.metadata.saveSubmission(registrar, projectId, form.id, {
          clientSubmissionId: ctx.stable(`attendance:${project.code}:${person.code}:${session}`),
          values: {
            beneficiary_code: person.code,
            participation_date: date,
            attendance_status: absent ? 'ABSENT' : done ? 'COMPLETED' : 'PRESENT',
            progress_status: absent ? 'NEEDS_FOLLOW_UP' : done ? 'COMPLETED' : 'IN_PROGRESS',
            progress_notes: absent
              ? 'Absent because of illness in the family; the officer will visit the household.'
              : 'Participated actively in the session.',
          },
        })) as { id: string; updatedAt: string; status: string }
        if (saved.status === 'DRAFT')
          await ctx.services.metadata.submitSubmission(registrar, projectId, form.id, saved.id, {
            expectedUpdatedAt: saved.updatedAt,
          })
        recorded += 1
      }
    }
  }
  ctx.log(`  attendance submissions: ${recorded}`)
}
