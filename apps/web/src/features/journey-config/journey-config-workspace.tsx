'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { SectionCard } from '@/components/pathways/section-card'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity, JourneyStageConfig, ProjectDetail } from '@/types/pathways'

import {
  branchSummary,
  mappedCount,
  moveStage,
  stageTypeStyle,
  stageTypes,
  validateStages,
} from './journey-config-utils'
import { JourneyStageDetails } from './journey-stage-details'
import { JourneyStageList } from './journey-stage-list'
import { JourneyTrack } from './journey-track'

type WorkspaceProps = {
  project: ProjectDetail
  activities: Pick<Activity, 'id' | 'title' | 'journeyStageId'>[]
  initialStages: JourneyStageConfig[]
}

export const JourneyConfigWorkspace = ({ project, activities, initialStages }: WorkspaceProps) => {
  const { role, profile } = useCurrentRole()
  const canEdit = isUiActionAvailable(role, 'journeys.manage', profile)
  const [stages, setStages] = useState(initialStages)
  const [selectedId, setSelectedId] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const selected = useMemo(
    () => stages.find((stage) => stage.id === selectedId),
    [stages, selectedId],
  )
  const branches = branchSummary(stages)
  const actor = [role, profile?.fullName].filter(Boolean).join(' · ')

  const update = <Key extends keyof JourneyStageConfig>(
    key: Key,
    value: JourneyStageConfig[Key],
  ) => {
    if (!selected || !canEdit) return
    setStages((current) =>
      current.map((stage) => {
        if (stage.id !== selected.id) return stage
        const next = { ...stage, [key]: value }
        return key === 'type' && value !== 'Branch' ? { ...next, parentStageId: undefined } : next
      }),
    )
  }

  const addStage = () => {
    if (!canEdit) return
    const order = Math.max(0, ...stages.map((stage) => stage.order)) + 1
    const stage: JourneyStageConfig = {
      id: crypto.randomUUID(),
      projectId: project.id,
      code: `J${order}`,
      name: 'New journey stage',
      order,
      type: 'Core',
      terminal: false,
      mappedActivityIds: [],
      description: '',
    }
    setStages((current) => [...current, stage])
    setSelectedId(stage.id)
  }

  const save = async () => {
    const problem = validateStages(stages)
    if (problem) return toast.error(problem)
    setSaving(true)
    try {
      setStages(await pathwaysClient.saveJourneyStages(project.id, stages))
      toast.success('Journey-stage configuration saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Journey stages could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Configure journey stages</h1>
          <p className="text-sm text-muted-foreground">
            Define the beneficiary journey structure, branching paths, and activity mappings for
            this project.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            Preview journey
          </Button>
          {canEdit ? (
            <Button type="button" disabled={saving} onClick={save}>
              Save configuration
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">{stages.length} stages configured</StatusBadge>
        <StatusBadge tone="neutral">{mappedCount(stages)} activities mapped</StatusBadge>
        {branches ? <StatusBadge tone="success">Branching enabled · {branches}</StatusBadge> : null}
        {actor ? <span className="ml-auto text-xs text-muted-foreground">{actor}</span> : null}
      </div>

      <SectionCard
        title="Journey track preview"
        description="Live view - updates as you configure stages below"
      >
        <JourneyTrack stages={stages} selectedId={selectedId} onSelect={setSelectedId} />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Stages" description="Click to configure · drag to reorder">
          <div className="space-y-3">
            {canEdit ? (
              <Button type="button" variant="outline" onClick={addStage}>
                Add stage
              </Button>
            ) : null}
            <JourneyStageList
              stages={stages}
              selectedId={selectedId}
              canEdit={canEdit}
              onSelect={setSelectedId}
              onAdd={addStage}
              onMove={(id, target) => setStages((current) => moveStage(current, id, target))}
            />
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Stage details" description="Select a stage to configure">
            {selected ? (
              <JourneyStageDetails
                stage={selected}
                stages={stages}
                activities={activities}
                canEdit={canEdit}
                onChange={update}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a stage from the list to edit its details and activity mappings
              </p>
            )}
          </SectionCard>
          <SectionCard title="Stage type guide">
            <dl className="space-y-3">
              {stageTypes.map((type) => {
                const { icon: Icon, node, guide } = stageTypeStyle[type]
                return (
                  <div key={type} className="flex items-start gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${node}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <dt className="text-sm font-semibold text-foreground">{type}</dt>
                      <dd className="text-sm text-muted-foreground">{guide}</dd>
                    </div>
                  </div>
                )
              })}
            </dl>
          </SectionCard>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview journey</DialogTitle>
            <DialogDescription>
              Read-only view of the journey track, including unsaved changes.
            </DialogDescription>
          </DialogHeader>
          <JourneyTrack stages={stages} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
