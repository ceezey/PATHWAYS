import { publicMediaBytes, publicMediaPlan } from './local-demo-public-media'
import type { DemoContext } from './local-demo-seed'
import { putSignedUpload } from './local-demo-stage-activities'
import { asUser, projectOf, sha256, step } from './local-demo-util'

export type MediaRow = {
  id: string
  sha256: string
  storageReady: boolean
  publicVisibilityStatus: 'PRIVATE' | 'FOR_REVIEW' | 'APPROVED' | 'PUBLISHED'
  status: string
}

/** The usable row already holding these bytes; unfinished uploads and rejected rows are left alone. */
export const pickExisting = (rows: MediaRow[], hash: string) =>
  rows.find((row) => row.sha256 === hash && row.storageReady && row.status !== 'REJECTED')

/** Uploads and approves the project's planned public photos and videos once; returns them in plan order. */
export async function ensurePublicMedia(ctx: DemoContext, key: keyof typeof publicMediaPlan) {
  const projectId = projectOf(ctx, key)
  const uploader = ctx.staff.projectManager.identity
  const approver = ctx.staff.programManager.identity
  const service = ctx.services.publicMedia
  const rows = (await asUser(ctx, ctx.staff.projectManager, (tx) =>
    tx.evidenceMedia.findMany({
      where: { projectId, enrollmentId: null, activityId: null },
      select: {
        id: true,
        sha256: true,
        storageReady: true,
        publicVisibilityStatus: true,
        status: true,
      },
    }),
  )) as MediaRow[]
  let uploaded = 0
  let approved = 0
  const media: Array<{ id: string; caption: string }> = []
  for (const item of publicMediaPlan[key]) {
    const file = publicMediaBytes(item)
    const hash = sha256(file.bytes)
    let row = pickExisting(rows, hash)
    if (!row) {
      const reserved = await step(`reserve ${file.fileName}`, () =>
        service.reserve(uploader, projectId, {
          files: [
            {
              fileName: file.fileName,
              contentType: file.contentType,
              byteSize: file.bytes.length,
              sha256: hash,
            },
          ],
        }),
      )
      const entry = reserved.files[0]
      if (entry.uploadUrl) await putSignedUpload(ctx, entry.uploadUrl, file.bytes, file.contentType)
      await step(`finalize ${file.fileName}`, () =>
        service.finalize(uploader, projectId, entry.mediaId),
      )
      row = {
        id: entry.mediaId,
        sha256: hash,
        storageReady: true,
        publicVisibilityStatus: 'FOR_REVIEW',
        status: 'PENDING',
      }
      rows.push(row)
      uploaded += 1
    }
    if (row.publicVisibilityStatus === 'FOR_REVIEW') {
      const id = row.id
      await step(`approve ${file.fileName}`, () => service.approve(approver, projectId, id))
      row.publicVisibilityStatus = 'APPROVED'
      approved += 1
    }
    media.push({ id: row.id, caption: item.caption })
  }
  ctx.log(`  ${key} public media uploaded ${uploaded}, approved ${approved}`)
  return media
}
