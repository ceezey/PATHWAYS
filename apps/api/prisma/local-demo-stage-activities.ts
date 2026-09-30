import type { ApplicationIdentity } from '../src/modules/auth/developer-access'
import {
  type DemoActivity,
  type DemoProject,
  addDaysIso,
  demoActivities,
  demoProjects,
} from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { asUser, fieldPhotoPng, projectOf, sha256, textPdf } from './local-demo-util'

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

type ProofFile = { fileName: string; contentType: 'image/png' | 'application/pdf'; bytes: Buffer }

function proofFiles(project: DemoProject, activity: DemoActivity, seed: number): ProofFile[] {
  return [
    {
      fileName: `${activity.key}-field-photo.png`,
      contentType: 'image/png',
      bytes: fieldPhotoPng(seed),
    },
    {
      fileName: `${activity.key}-attendance-sheet.pdf`,
      contentType: 'application/pdf',
      bytes: textPdf(`${activity.title}`, [
        `Project: ${project.title}`,
        `Location: ${project.cityMunicipality}, ${project.province}`,
        'Participants signed the attendance list on site.',
        'Prepared by the project officer for monitoring review.',
      ]),
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
  const files = proofFiles(project, activity, seed)
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

async function applyOutcome(
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
    case 'COMPLETED': {
      await startActivity(ctx, projectId, activityId, code)
      const updateId = await submitProof(
        ctx,
        project,
        activity,
        code,
        officer,
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
      return
    }
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
        budgetAllocation: activity.budget,
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
