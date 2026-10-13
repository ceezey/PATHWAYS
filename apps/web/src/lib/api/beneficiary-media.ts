import type {
  BeneficiaryMediaLimitsResponse,
  BeneficiaryMediaReservedFileResponse,
} from '@pathways/shared'

import { isFiniteNonNegative } from '@/lib/api/core/guards'
import {
  PathwaysClientError,
  requestFoundation,
  requestFoundationResponse,
} from '@/lib/api/core/request'
import type { ActivityProofFileDeclaration, BeneficiaryMediaItem } from '@/types/pathways'

const beneficiaryMediaPath = (projectId: string, beneficiaryId: string) =>
  `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}/media`

export const beneficiaryMediaClient = {
  async listBeneficiaryMedia(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaItem[]> {
    const rows = await requestFoundation(beneficiaryMediaPath(projectId, beneficiaryId))
    if (!Array.isArray(rows))
      throw new PathwaysClientError('Invalid beneficiary media response.', 'network')
    return rows as BeneficiaryMediaItem[]
  },

  async getBeneficiaryMediaLimits(
    projectId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryMediaLimitsResponse> {
    const limits = await requestFoundation(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/limits`,
    )
    if (!isFiniteNonNegative(limits?.maxFiles) || !isFiniteNonNegative(limits?.maxFileBytes))
      throw new PathwaysClientError('Invalid beneficiary media limits response.', 'network')
    return limits as BeneficiaryMediaLimitsResponse
  },

  async reserveBeneficiaryMedia(
    projectId: string,
    beneficiaryId: string,
    input: { files: ActivityProofFileDeclaration[]; note?: string },
  ): Promise<BeneficiaryMediaReservedFileResponse[]> {
    const reserved = await requestFoundation(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/reservations`,
      { method: 'POST', body: JSON.stringify(input) },
    )
    if (!Array.isArray(reserved?.files))
      throw new PathwaysClientError('Invalid beneficiary media reservation response.', 'network')
    return reserved.files as BeneficiaryMediaReservedFileResponse[]
  },

  async finalizeBeneficiaryMedia(
    projectId: string,
    beneficiaryId: string,
    mediaId: string,
  ): Promise<void> {
    await requestFoundation(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/${encodeURIComponent(mediaId)}/finalize`,
      { method: 'POST' },
    )
  },

  async getBeneficiaryMediaBlob(
    projectId: string,
    beneficiaryId: string,
    mediaId: string,
  ): Promise<Blob> {
    const response = await requestFoundationResponse(
      `${beneficiaryMediaPath(projectId, beneficiaryId)}/${encodeURIComponent(mediaId)}/content`,
    )
    return response.blob()
  },
}
