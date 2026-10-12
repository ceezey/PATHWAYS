import { useEffect, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import {
  type SensitiveDraftOwner,
  readSensitiveDraft,
  removeSensitiveDraft,
  writeSensitiveDraft,
} from '@/lib/auth/sensitive-drafts'

import type { ActivityFormSchema } from '../activity-form.utils'

export const useActivityFormDraft = ({
  draftStorageKey,
  form,
  indicatorIds,
  initialValues,
  journeyStageIds,
  officerIds,
  open,
  projectId,
  scope,
}: {
  draftStorageKey: string
  form: UseFormReturn<ActivityFormSchema>
  indicatorIds: string[]
  initialValues: ActivityFormSchema
  journeyStageIds: string[]
  officerIds: string[]
  open: boolean
  projectId: string
  scope: SensitiveDraftOwner
}) => {
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)

  useEffect(() => {
    if (!open) {
      setDraftHydrated(false)
      setDraftRecovered(false)
      return
    }

    let nextValues = initialValues
    try {
      const stored = readSensitiveDraft(draftStorageKey)
      if (stored) {
        const parsed = stored as Partial<Record<keyof ActivityFormSchema, unknown>>
        if (stored.projectId !== projectId) return
        const restored = { ...initialValues }

        for (const key of Object.keys(initialValues) as Array<keyof ActivityFormSchema>) {
          const value = parsed[key]
          const baseline = initialValues[key]
          if (Array.isArray(baseline) && Array.isArray(value)) {
            Object.assign(restored, {
              [key]: value
                .slice(0, 100)
                .filter((item) => typeof item === 'string' && item.length <= 10_000),
            })
          } else if (
            typeof value === typeof baseline &&
            (typeof value !== 'string' || value.length <= 10_000)
          ) {
            Object.assign(restored, { [key]: value })
          }
        }

        restored.assignedOfficers = restored.assignedOfficers.filter((officer) =>
          officerIds.includes(officer),
        )
        restored.connectedIndicators = restored.connectedIndicators.filter((indicatorId) =>
          indicatorIds.includes(indicatorId),
        )
        restored.journeyStageId = journeyStageIds.includes(restored.journeyStageId)
          ? restored.journeyStageId
          : ''
        nextValues = restored
        setDraftRecovered(true)
      }
    } catch {
      removeSensitiveDraft(draftStorageKey)
    }

    form.reset(nextValues)
    setDraftHydrated(true)
  }, [
    draftStorageKey,
    form,
    indicatorIds,
    initialValues,
    journeyStageIds,
    officerIds,
    open,
    projectId,
  ])

  useEffect(() => {
    if (!open || !draftHydrated) {
      return
    }

    const subscription = form.watch((values) => {
      if (!scope.isCurrent()) return
      const nextValues = values as ActivityFormSchema
      if (JSON.stringify(nextValues) === JSON.stringify(initialValues)) {
        removeSensitiveDraft(draftStorageKey)
      } else {
        writeSensitiveDraft(draftStorageKey, { ...nextValues, projectId }, scope.generation)
      }
    })

    return () => subscription.unsubscribe()
  }, [
    draftHydrated,
    draftStorageKey,
    form,
    initialValues,
    open,
    projectId,
    scope.isCurrent,
    scope.generation,
  ])

  return { draftRecovered }
}
