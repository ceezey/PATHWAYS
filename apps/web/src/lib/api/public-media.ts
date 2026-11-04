import {
  type BeneficiaryMediaLimitsResponse,
  type BeneficiaryMediaReservedFileResponse,
  publicMediaListResponse,
} from '@pathways/shared'

import { isFiniteNonNegative } from '@/lib/api/core/guards'
import { projectPath } from '@/lib/api/core/owned-json-read'
import {
  PathwaysClientError,
  requestFoundation,
  requestFoundationResponse,
} from '@/lib/api/core/request'
import type { ActivityProofFileDeclaration } from '@/types/pathways'

const basePath = (projectId: string) => `${projectPath(projectId)}/public-media`
const itemPath = (projectId: string, mediaId: string) =>
  `${basePath(projectId)}/${encodeURIComponent(mediaId)}`

export const publicMediaClient = {
  async list(projectId: string, signal?: AbortSignal) {
    const parsed = publicMediaListResponse.safeParse(
      await requestFoundation(basePath(projectId), { signal }),
    )
    if (!parsed.success) throw new PathwaysClientError('Invalid public media response.', 'network')
    return parsed.data
  },

  async limits(projectId: string): Promise<BeneficiaryMediaLimitsResponse> {
    const limits = await requestFoundation(`${basePath(projectId)}/limits`)
    if (!isFiniteNonNegative(limits?.maxFiles) || !isFiniteNonNegative(limits?.maxFileBytes))
      throw new PathwaysClientError('Invalid public media limits response.', 'network')
    return limits as BeneficiaryMediaLimitsResponse
  },

  async reserve(
    projectId: string,
    body: { files: ActivityProofFileDeclaration[] },
  ): Promise<BeneficiaryMediaReservedFileResponse[]> {
    const reserved = await requestFoundation(`${basePath(projectId)}/reservations`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!Array.isArray(reserved?.files))
      throw new PathwaysClientError('Invalid public media reservation response.', 'network')
    return reserved.files as BeneficiaryMediaReservedFileResponse[]
  },

  async finalize(projectId: string, mediaId: string): Promise<void> {
    await requestFoundation(`${itemPath(projectId, mediaId)}/finalize`, { method: 'POST' })
  },

  async submit(projectId: string, mediaId: string): Promise<void> {
    await requestFoundation(`${itemPath(projectId, mediaId)}/submit`, { method: 'POST' })
  },

  async approve(projectId: string, mediaId: string): Promise<void> {
    await requestFoundation(`${itemPath(projectId, mediaId)}/approve`, { method: 'POST' })
  },

  async reject(projectId: string, mediaId: string, reason: string): Promise<void> {
    await requestFoundation(`${itemPath(projectId, mediaId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  },

  async contentBlob(projectId: string, mediaId: string): Promise<Blob> {
    const response = await requestFoundationResponse(`${itemPath(projectId, mediaId)}/content`)
    return response.blob()
  },
}
