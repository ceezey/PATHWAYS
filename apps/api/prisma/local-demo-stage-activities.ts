import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ApplicationIdentity } from '../src/modules/auth/developer-access'
import {
  type DemoActivity,
  type DemoProject,
  addDaysIso,
  demoActivities,
  demoProjects,
} from './local-demo-data'
import { sessionRoster } from './local-demo-journeys'
import type { DemoContext } from './local-demo-seed'
import { asUser, projectOf, sha256, textPdf } from './local-demo-util'

const photoDir = path.join(__dirname, 'assets', 'demo-photos')

/** The seeded field photo that matches the project and activity. */
export function proofPhotoName(project: DemoProject, activity: DemoActivity) {
  if (/follow-up|home visit|referral/i.test(`${activity.title} ${activity.description}`))
    return 'household-follow-up'
  return {
    SSG: 'committee-training',
    ALS: 'learning-center-review',
    EHK: 'hygiene-kit-distribution',
    CRL: 'livelihood-coaching',
    WSH: 'wash-handwashing',
    ECD: 'household-follow-up',
  }[project.key]
}

/** Attendance sheet lines: title, date, venue, facilitator and the people the seed records at the session. */
export function attendanceSheetLines(project: DemoProject, activity: DemoActivity, today: string) {
  const roster = sessionRoster(project.key, activity.key, today)
  const date = roster?.date ?? addDaysIso(today, Math.min(activity.endOffset, -1))
  const venue = `${roster?.people[0]?.barangay ?? project.barangays[0]}, ${project.cityMunicipality}, ${project.province}`
  const people = (roster?.people ?? []).slice(0, 14)
  return [
    `Project: ${project.title}`,
    `Date: ${date}`,
    `Venue: ${venue}`,
    'Facilitator: Project Officer, assigned to the activity',
    people.length > 0
      ? `Participants present (${people.length}):`
      : `Participants: ${activity.reached ?? activity.target} signed the list on site.`,
    ...people.map(
      (p, i) =>
        `${i + 1}. ${p.lastName}, ${p.firstName} ${p.middleName.charAt(0)}.  ${p.code}  signed`,
    ),
    'Prepared by the project officer for monitoring review.',
  ]
}

export const activityCode = (project: DemoProject, index: number) =>
  `${project.key}-${String(index + 1).padStart(2, '0')}`

/** Uploads one file to the signed URL the service returned, exactly like the browser does. */
async function putSignedUpload(
  ctx: DemoContext,
  uploadUrl: string,
  bytes: Buffer,
  contentType: string,
) {
  const url = new URL(uploadUrl)
  const marker = '/object/upload/sign/'
  const start = url.pathname.indexOf(marker)
  const [bucket, ...rest] = decodeURIComponent(url.pathname.slice(start + marker.length)).split('/')
  const token = url.searchParams.get('token')
  if (start < 0 || !token) throw new Error('Unexpected upload URL.')
  const { error } = await ctx.supabase.storage
    .from(bucket)
    .uploadToSignedUrl(rest.join('/'), token, bytes, { contentType })
  if (error) throw error
}

type ProofFile = { fileName: string; contentType: 'image/jpeg' | 'application/pdf'; bytes: Buffer }

function proofFiles(
  project: DemoProject,
  activity: DemoActivity,
  today: string,
  _seed: number,
): ProofFile[] {
  return [
    {
      fileName: `${activity.key}-field-photo.jpg`,
      contentType: 'image/jpeg',
      bytes: readFileSync(path.join(photoDir, `${proofPhotoName(project, activity)}.jpg`)),
    },
    {
      fileName: `${activity.key}-attendance-sheet.pdf`,
      contentType: 'application/pdf',
      bytes: textPdf(activity.title, attendanceSheetLines(project, activity, today)),
    },
  ]
}

async function submitProof(
  ctx: DemoContext,
  project: DemoProject,
  activity: DemoActivity,
  code: string,
  officer: ApplicationIdentity,
  projectId: string,
  activityId: string,
  progress: number,
  note: string,
  seed: number,
) {
  const files = proofFiles(project, activity, ctx.today, seed)
  const clientUpdateId = ctx.stable(`proof:${code}:${progress}`)
  const reserved = (await ctx.services.activities.reserveProof(officer, projectId, activityId, {
    clientUpdateId,
    progressPercent: progress,
    note,
    beneficiariesReachedThisSession: activity.reached,
    files: files.map((file) => ({
      fileName: file.fileName,
      contentType: file.contentType,
      byteSize: file.bytes.length,
      sha256: sha256(file.bytes),
    })),
  })) as {
    updateId: string
    files: Array<{ evidenceId: string; fileName: string; uploadUrl: string | null }>
  }
  for (const entry of reserved.files) {
    const file = files.find((candidate) => candidate.fileName === entry.fileName)
    if (!file) throw new Error('Reserved file is unknown.')
    if (entry.uploadUrl) await putSignedUpload(ctx, entry.uploadUrl, file.bytes, file.contentType)
    await ctx.services.activities.finalizeProofFile(
      officer,
      projectId,
      activityId,
      reserved.updateId,
      entry.evidenceId,
    )
  }
  return reserved.updateId
}

async function review(
  ctx: DemoContext,
  projectId: string,
  activityId: string,
  updateId: string,
  decision: 'APPROVE' | 'RETURN',
  reason: string,
) {
  const row = await asUser(ctx, ctx.staff.me, (tx) =>
    tx.activityUpdate.findUniqueOrThrow({ where: { id: updateId }, select: { updatedAt: true } }),
  )
  await ctx.services.activities.reviewUpdate(
    ctx.staff.me.identity,
    projectId,
    activityId,
    updateId,
    {
      clientMutationId: ctx.stable(`review:${updateId}:${decision}`),
      decision,
      reason,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    },
  )
}

async function startActivity(
  ctx: DemoContext,
  projectId: string,
  activityId: string,
  code: string,
) {
  const row = await ctx.owner.projectActivity.findUniqueOrThrow({
    where: { id: activityId },
    select: { updatedAt: true },
  })
  await ctx.services.activities.transition(
    ctx.staff.projectManager.identity,
    projectId,
    activityId,
    {
      clientMutationId: ctx.stable(`start:${code}`),
      status: 'IN_PROGRESS',
      expectedUpdatedAt: row.updatedAt.toISOString(),
    },
  )
}

async function explainOverdue(
  ctx: DemoContext,
  activity: DemoActivity,
  code: string,
  projectId: string,
  activityId: string,
) {
  await ctx.services.activities.recordOverdueExplanation(
    ctx.staff.me.identity,
    projectId,
    activityId,
    {
      clientMutationId: ctx.stable(`overdue:${code}`),
      category: activity.category ?? 'OTHER',
      explanation:
        activity.explanation ??
        'The activity was delayed by circumstances outside the team control.',
    },
  )
}

/** Submits the proof at 100 percent and has the Monitoring and Evaluation Officer approve it. */
async function completeWithProof(
  ctx: DemoContext,
  project: DemoProject,
  activity: DemoActivity,
  code: string,
  projectId: string,
  activityId: string,
  seed: number,
) {
  const updateId = await submitProof(
    ctx,
    project,
    activity,
    code,
    ctx.staff[activity.officer].identity,
    projectId,
    activityId,
    100,
    activity.note ?? '',
    seed,
  )
  await review(
    ctx,
    projectId,
    activityId,
    updateId,
    'APPROVE',
    activity.reviewNote ?? 'Proof verified.',
  )
}

export async function applyOutcome(
  ctx: DemoContext,
  project: DemoProject,
  activity: DemoActivity,
  code: string,
  projectId: string,
  activityId: string,
  seed: number,
) {
  const officer = ctx.staff[activity.officer].identity
  const pm = ctx.staff.projectManager.identity
  switch (activity.outcome) {
    case 'NOT_STARTED':
    case 'OVERDUE_OPEN':
      return
    case 'CANCELLED': {
      const row = await ctx.owner.projectActivity.findUniqueOrThrow({
        where: { id: activityId },
        select: { updatedAt: true },
      })
      await ctx.services.activities.transition(pm, projectId, activityId, {
        clientMutationId: ctx.stable(`cancel:${code}`),
        status: 'CANCELLED',
        reason: activity.reason,
        expectedUpdatedAt: row.updatedAt.toISOString(),
      })
      return
    }
    case 'IN_PROGRESS':
      await startActivity(ctx, projectId, activityId, code)
      return
    case 'OVERDUE_EXPLAINED':
      await startActivity(ctx, projectId, activityId, code)
      await explainOverdue(ctx, activity, code, projectId, activityId)
      return
    case 'PROGRESS_VERIFIED': {
      await startActivity(ctx, projectId, activityId, code)
      await ctx.services.activities.recordProgress(officer, projectId, activityId, {
        clientUpdateId: ctx.stable(`progress:${code}`),
        progressPercent: activity.progress ?? 50,
        note: activity.note ?? 'Progress recorded after the monitoring visit.',
      })
      const update = await asUser(ctx, ctx.staff.me, (tx) =>
        tx.activityUpdate.findFirstOrThrow({
          where: { activityId, status: 'PENDING' },
          select: { id: true },
        }),
      )
      await review(
        ctx,
        projectId,
        activityId,
        update.id,
        'APPROVE',
        activity.reviewNote ?? 'Progress verified.',
      )
      return
    }
    case 'PENDING_REVIEW':
      await startActivity(ctx, projectId, activityId, code)
      await submitProof(
        ctx,
        project,
        activity,
        code,
        officer,
        projectId,
        activityId,
        activity.progress ?? 60,
        activity.note ?? '',
        seed,
      )
      return
    case 'RETURNED': {
      await startActivity(ctx, projectId, activityId, code)
      const updateId = await submitProof(
        ctx,
        project,
        activity,
        code,
        officer,
        projectId,
        activityId,
        activity.progress ?? 40,
        activity.note ?? '',
        seed,
      )
      await review(
        ctx,
        projectId,
        activityId,
        updateId,
        'RETURN',
        activity.reviewNote ?? 'Please correct and resubmit.',
      )
      return
    }
    case 'COMPLETED_LATE':
      await startActivity(ctx, projectId, activityId, code)
      await explainOverdue(ctx, activity, code, projectId, activityId)
      await completeWithProof(ctx, project, activity, code, projectId, activityId, seed)
      return
    case 'COMPLETED':
      await startActivity(ctx, projectId, activityId, code)
      await completeWithProof(ctx, project, activity, code, projectId, activityId, seed)
      return
  }
}

export async function stageActivities(ctx: DemoContext) {
  const pm = ctx.staff.projectManager.identity
  let created = 0
  let seed = 0
  for (const project of demoProjects) {
    const projectId = projectOf(ctx, project.key)
    const list = demoActivities[project.key]
    for (const [index, activity] of list.entries()) {
      seed += 1
      const code = activityCode(project, index)
      const existing = await ctx.owner.projectActivity.findFirst({
        where: { organizationId: ctx.organizationId, projectId, code },
        select: { id: true },
      })
      if (existing) continue
      const projectRow = await ctx.owner.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { startDate: true, endDate: true },
      })
      const plannedStart = addDaysIso(ctx.today, activity.startOffset)
      const plannedEnd = addDaysIso(ctx.today, activity.endOffset)
      const outside =
        (projectRow.startDate && plannedStart < projectRow.startDate.toISOString().slice(0, 10)) ||
        (projectRow.endDate && plannedEnd > projectRow.endDate.toISOString().slice(0, 10))
      const result = (await ctx.services.activities.create(pm, projectId, {
        clientMutationId: ctx.stable(`activity:${code}`),
        code,
        title: activity.title,
        description: activity.description,
        activityType: activity.type,
        plannedStartDate: plannedStart,
        plannedEndDate: plannedEnd,
        targetBeneficiaries: activity.target,
        ...(activity.budget ? { budgetAllocation: activity.budget } : {}),
        assignedUserIds: [ctx.staff[activity.officer].userId],
        ...(outside
          ? { timelineOverrideJustification: 'Planned dates follow the approved work plan.' }
          : {}),
      })) as { id: string }
      created += 1
      await applyOutcome(ctx, project, activity, code, projectId, result.id, seed)
    }
  }
  ctx.log(`  activities created: ${created}`)
}
