import { z } from 'zod'
import { requestFoundation, requestFoundationResponse } from './pathways-client'

const revision = z.string().datetime({ precision: 3 })
const contextSchema = z
  .object({
    activityId: z.string().uuid(),
    updateId: z.string().uuid(),
    expectedActivityUpdatedAt: revision,
    expectedUpdateUpdatedAt: revision,
    proofs: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            label: z.literal('Activity proof'),
            expectedEvidenceUpdatedAt: revision,
          })
          .strict(),
      )
      .max(5),
  })
  .strict()
const proofExtensions: Record<string, string> = {
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}
const MAX_PROOF_BYTES = 10 * 1024 * 1024
export type PrivateProofFile = { blob: Blob; fileName: string }
export type PrivateProofContext = z.infer<typeof contextSchema>
const prefix = (projectId: string, activityId: string, updateId: string) =>
  `/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(activityId)}/updates/${encodeURIComponent(updateId)}`
export const privateProofClient = {
  async context(
    projectId: string,
    activityId: string,
    updateId: string,
  ): Promise<PrivateProofContext> {
    const result = contextSchema.parse(
      await requestFoundation(`${prefix(projectId, activityId, updateId)}/inspection-context`),
    )
    if (
      result.activityId !== activityId ||
      result.updateId !== updateId ||
      new Set(result.proofs.map((proof) => proof.id)).size !== result.proofs.length
    )
      throw new Error('Private proof context unavailable.')
    return result
  },
  async inspect(
    projectId: string,
    context: PrivateProofContext,
    evidenceId: string,
    signal: AbortSignal,
  ): Promise<PrivateProofFile> {
    const proof = context.proofs.find((entry) => entry.id === evidenceId)
    if (!proof) throw new Error('Private proof unavailable.')
    const query = new URLSearchParams({
      expectedActivityUpdatedAt: context.expectedActivityUpdatedAt,
      expectedUpdateUpdatedAt: context.expectedUpdateUpdatedAt,
      expectedEvidenceUpdatedAt: proof.expectedEvidenceUpdatedAt,
    })
    const response = await requestFoundationResponse(
      `${prefix(projectId, context.activityId, context.updateId)}/proof/${encodeURIComponent(evidenceId)}/inspection?${query}`,
      { signal },
    )
    const type = response.headers.get('content-type') ?? ''
    const extension = proofExtensions[type]
    if (
      !extension ||
      response.headers.get('x-content-type-options') !== 'nosniff' ||
      response.headers.get('content-disposition') !==
        `attachment; filename="activity-proof.${extension}"`
    )
      throw new Error('Private proof unavailable.')
    const blob = await response.blob()
    if (blob.size > MAX_PROOF_BYTES) throw new Error('Private proof unavailable.')
    return {
      blob: blob.type === type ? blob : new Blob([blob], { type }),
      fileName: `activity-proof.${extension}`,
    }
  },
}
