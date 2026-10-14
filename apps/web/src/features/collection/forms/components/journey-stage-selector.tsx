'use client'

import { useEffect, useState } from 'react'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { journeysClient } from '@/lib/api/journeys'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { JourneyStageConfig } from '@/types/pathways'

export const JourneyStageSelector = ({
  projectId,
  value,
  onChange,
}: { projectId: string; value: string; onChange: (value: string) => void }) => {
  const { profile } = useCurrentRole()
  const canRead = principalHasAtomicPermission(profile, 'journeys.read')
  const [stages, setStages] = useState<JourneyStageConfig[]>([])
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    setStages([])
    setUnavailable(false)
    if (projectId && canRead) {
      void journeysClient.getJourneyStages(projectId).then(
        (records) => {
          if (active) setStages(records)
        },
        () => {
          if (active) setUnavailable(true)
        },
      )
    }
    return () => {
      active = false
    }
  }, [projectId, canRead])
  return (
    <>
      <Label htmlFor="journey-stage">Journey stage</Label>
      <Select
        value={value || '__none__'}
        onValueChange={(next) => onChange(next === '__none__' ? '' : next)}
        disabled={!canRead || unavailable}
      >
        <SelectTrigger id="journey-stage">
          <SelectValue placeholder="No linked stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No linked stage</SelectItem>
          {value && !stages.some((stage) => stage.id === value) && (
            <SelectItem value={value}>Previously selected stage</SelectItem>
          )}
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {unavailable && (
        <p className="text-sm text-muted-foreground">
          Stages could not be loaded. The saved link is retained.
        </p>
      )}
    </>
  )
}
