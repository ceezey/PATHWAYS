import { useEffect, useMemo, useState } from 'react'

import {
  type SensitiveDraftOwner,
  readSensitiveDraft,
  removeSensitiveDraft,
  writeSensitiveDraft,
} from '@/lib/auth/sensitive-drafts'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import { type BeneficiaryDraft, draftFromBeneficiary, initialDraft } from '../registration.utils'

export const useRegistrationDraft = ({
  beneficiary,
  projects,
  selectedProjectId,
  scope,
}: {
  beneficiary?: BeneficiaryRecord
  projects: ProjectSummary[]
  selectedProjectId: string
  scope: SensitiveDraftOwner
}) => {
  const startingDraft = useMemo(
    () =>
      beneficiary
        ? draftFromBeneficiary(beneficiary, projects)
        : { ...initialDraft, projectId: selectedProjectId },
    [beneficiary, projects, selectedProjectId],
  )
  const draftStorageKey = scope.key
  const [draft, setDraft] = useState<BeneficiaryDraft>(startingDraft)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setDraft(startingDraft)
    setDraftRecovered(false)
    setSubmitted(false)

    try {
      const stored = scope.isCurrent() ? readSensitiveDraft(draftStorageKey) : null
      if (stored) {
        const parsed = stored as Partial<Record<keyof BeneficiaryDraft, unknown>>
        if (parsed.projectId !== selectedProjectId) return
        const restored = { ...startingDraft }

        for (const key of Object.keys(startingDraft) as Array<keyof BeneficiaryDraft>) {
          if (
            beneficiary &&
            [
              'code',
              'projectId',
              'consentToParticipate',
              'consentToStoreData',
              'isMinor',
              'guardianConsent',
            ].includes(key)
          )
            continue
          if (
            typeof parsed[key] === typeof startingDraft[key] &&
            (typeof parsed[key] !== 'string' || (parsed[key] as string).length <= 10_000)
          ) {
            Object.assign(restored, { [key]: parsed[key] })
          }
        }

        setDraft(restored)
        setDraftRecovered(true)
      }
    } catch {
      removeSensitiveDraft(draftStorageKey)
    } finally {
      setDraftHydrated(true)
    }
  }, [draftStorageKey, startingDraft, selectedProjectId, beneficiary, scope.isCurrent])

  useEffect(() => {
    if (!draftHydrated || !scope.isCurrent()) {
      return
    }

    if (JSON.stringify(draft) === JSON.stringify(startingDraft)) {
      removeSensitiveDraft(draftStorageKey)
    } else {
      writeSensitiveDraft(draftStorageKey, draft, scope.generation)
    }
  }, [draft, draftHydrated, draftStorageKey, startingDraft, scope.isCurrent, scope.generation])

  return { draft, setDraft, draftRecovered, submitted, setSubmitted, draftStorageKey }
}
