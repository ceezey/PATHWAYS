import { describe, expect, it } from 'vitest'

import { publicationTransitionRequest } from './public-projects'
import {
  PUBLIC_SMALL_CELL_REVIEW_THRESHOLD,
  approvePublicMediaRequest,
  publicationApprovalChecklist,
} from './publication-checklist'

const all = {
  smallGroupsChecked: true,
  noIdentifiableMinor: true,
  imageConsentOnFile: true,
  pinPositionsAcceptable: true,
} as const

describe('publication approval checklist', () => {
  it('accepts only all four items confirmed', () => {
    expect(publicationApprovalChecklist.safeParse(all).success).toBe(true)
    for (const key of Object.keys(all)) {
      expect(publicationApprovalChecklist.safeParse({ ...all, [key]: false }).success).toBe(false)
      const { [key as keyof typeof all]: _gone, ...missing } = all
      expect(publicationApprovalChecklist.safeParse(missing).success).toBe(false)
    }
    expect(publicationApprovalChecklist.safeParse({ ...all, extra: true }).success).toBe(false)
  })

  it('rides on the transition request', () => {
    const body = { clientRequestId: crypto.randomUUID(), expectedRevision: 1 }
    expect(publicationTransitionRequest.safeParse({ ...body, checklist: all }).success).toBe(true)
    expect(
      publicationTransitionRequest.safeParse({
        ...body,
        checklist: { ...all, smallGroupsChecked: false },
      }).success,
    ).toBe(false)
  })

  it('needs both media items', () => {
    const checklist = { noIdentifiableMinor: true, imageConsentOnFile: true }
    expect(approvePublicMediaRequest.safeParse({ checklist }).success).toBe(true)
    expect(approvePublicMediaRequest.safeParse({}).success).toBe(false)
    expect(
      approvePublicMediaRequest.safeParse({
        checklist: { ...checklist, imageConsentOnFile: false },
      }).success,
    ).toBe(false)
  })

  it('reviews counts under five', () => {
    expect(PUBLIC_SMALL_CELL_REVIEW_THRESHOLD).toBe(5)
  })
})
