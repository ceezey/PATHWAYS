import type { BeneficiaryMediaReviewStatus, BeneficiaryMediaType } from '@/types/pathways'

export const supportedBeneficiaryMediaTypes = ['image/jpeg', 'image/png', 'video/mp4'] as const

export const isSupportedBeneficiaryMedia = (mimeType: string) =>
  supportedBeneficiaryMediaTypes.includes(
    mimeType.toLowerCase() as (typeof supportedBeneficiaryMediaTypes)[number],
  )

export const beneficiaryMediaTypeFromMime = (mimeType: string): BeneficiaryMediaType | null => {
  if (mimeType.startsWith('image/')) {
    return 'Photo'
  }

  if (mimeType.startsWith('video/')) {
    return 'Video'
  }

  return null
}

export const formatMediaFileSize = (bytes: number) => {
  if (bytes < 1_000_000) {
    return `${Math.max(1, Math.round(bytes / 1_000))} KB`
  }

  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export const formatMediaDuration = (seconds?: number) => {
  if (typeof seconds !== 'number') {
    return undefined
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export const parseMediaTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim().slice(0, 32))
        .filter(Boolean),
    ),
  ).slice(0, 6)

export const beneficiaryMediaReviewTone = (status: BeneficiaryMediaReviewStatus) => {
  switch (status) {
    case 'Accepted':
      return 'success'
    case 'Needs Clarification':
      return 'warning'
    default:
      return 'info'
  }
}
