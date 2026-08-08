'use client'

import { GitBranch, Plus, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import type {
  Activity,
  JourneyStageConfig,
  JourneyStageType,
  ProjectDetail,
} from '@/types/pathways'

import { stageTypeTone } from './beneficiary-utils'

type JourneyStagesWorkspaceProps = {
  project: ProjectDetail
  activities: Activity[]
  initialStages: JourneyStageConfig[]
}

const stageTypes: JourneyStageType[] = ['Entry', 'Core', 'Branch', 'Follow-Up']
const noParentValue = 'none'

export const JourneyStagesWorkspace = ({
  project,
  activities,
  initialStages,
}: JourneyStagesWorkspaceProps) => {
  const { labels } = usePrototypeLabels()
  const [stages, setStages] = useState(initialStages)
  const [selectedStageId, setSelectedStageId] = useState(initialStages[0]?.id ?? '')
  const [saveOpen, setSaveOpen] = useState(false)

  const selectedStage = useMemo(
    () => stages.find((stage) => stage.id === selectedStageId) ?? stages[0],
    [selectedStageId, stages],
  )
  const orderedStages = useMemo(
    () => stages.slice().sort((first, second) => first.order - second.order),
    [stages],
  )
  const branchStages = orderedStages.filter((stage) => stage.type === 'Branch')

  const updateStage = <Key extends keyof JourneyStageConfig>(
    key: Key,
    value: JourneyStageConfig[Key],
  ) => {
    if (!selectedStage) {
      return
    }

    setStages((current) =>
      current.map((stage) => (stage.id === selectedStage.id ? { ...stage, [key]: value } : stage)),
    )
  }

  const addStage = () => {
    const nextOrder = Math.max(0, ...stages.map((stage) => stage.order)) + 1
    const nextStage: JourneyStageConfig = {
      id: `stage-prototype-${Date.now().toString(36)}`,
      projectId: project.id,
      code: `J${nextOrder}`,
      name: 'New prototype stage',
      order: nextOrder,
      type: 'Core',
      terminal: false,
      mappedActivityIds: [],
      description: 'Draft stage created in the local prototype.',
    }
    setStages((current) => [...current, nextStage])
    setSelectedStageId(nextStage.id)
    toast.info('Prototype stage added.')
  }

  const toggleActivity = (activityId: string) => {
    if (!selectedStage) {
      return
    }

    const mappedActivityIds = selectedStage.mappedActivityIds.includes(activityId)
      ? selectedStage.mappedActivityIds.filter((id) => id !== activityId)
      : [...selectedStage.mappedActivityIds, activityId]

    updateStage('mappedActivityIds', mappedActivityIds)
  }

  const saveConfiguration = () => {
    // TODO(DATABASE): Load configurable stages and activity-stage mappings.
    setSaveOpen(false)
    toast.success('Journey-stage configuration saved locally.', {
      description: 'This demonstration keeps the changes in your current browser session only.',
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <StatusBadge tone="info">Project-specific stages</StatusBadge>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {labels.projectJourneyStages}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Define the project stage path, branch options, terminal follow-up stages, and activity
              mappings used to compute beneficiary progress.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={addStage}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add stage
          </Button>
          <Button onClick={() => setSaveOpen(true)}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            Save configuration
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">Stage diagram</h2>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {orderedStages.map((stage) => (
            <button
              key={stage.id}
              className={`rounded-lg border p-4 text-left transition-colors ${
                stage.id === selectedStage?.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-background hover:bg-muted/60'
              }`}
              aria-pressed={selectedStage?.id === stage.id}
              type="button"
              onClick={() => setSelectedStageId(stage.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground">{stage.code}</p>
                <StatusBadge tone={stageTypeTone(stage.type)}>{stage.type}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{stage.name}</p>
              {stage.terminal ? (
                <p className="mt-3 text-xs font-medium text-foreground">Terminal stage</p>
              ) : null}
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-lg border border-info/20 bg-info/10 p-3 text-sm leading-6 text-info">
          Open-ended follow-up can continue after core participation. The interface supports human
          review and beneficiary context, not strict timeline compliance scoring.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Stage list</h2>
          <div className="mt-4 space-y-3">
            {orderedStages.map((stage) => {
              const mappedActivities = activities.filter((activity) =>
                stage.mappedActivityIds.includes(activity.id),
              )

              return (
                <button
                  key={stage.id}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    stage.id === selectedStage?.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-muted/60'
                  }`}
                  aria-pressed={selectedStage?.id === stage.id}
                  type="button"
                  onClick={() => setSelectedStageId(stage.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {stage.order}. {stage.code} · {stage.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Parent:{' '}
                        {stages.find((item) => item.id === stage.parentStageId)?.code ?? 'None'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={stageTypeTone(stage.type)}>{stage.type}</StatusBadge>
                      {stage.terminal ? <StatusBadge tone="neutral">Terminal</StatusBadge> : null}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {mappedActivities.length > 0
                      ? mappedActivities.map((activity) => activity.title).join(', ')
                      : 'No activities mapped yet'}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Stage details</h2>
          {selectedStage ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Label className="space-y-2">
                  <span>Stage code</span>
                  <Input
                    value={selectedStage.code}
                    onChange={(event) => updateStage('code', event.target.value)}
                  />
                </Label>
                <Label className="space-y-2">
                  <span>Order</span>
                  <Input
                    min="1"
                    type="number"
                    value={selectedStage.order}
                    onChange={(event) => updateStage('order', Number(event.target.value))}
                  />
                </Label>
              </div>
              <Label className="space-y-2">
                <span>Stage name</span>
                <Input
                  value={selectedStage.name}
                  onChange={(event) => updateStage('name', event.target.value)}
                />
              </Label>
              <Label className="space-y-2">
                <span>Stage type</span>
                <Select
                  value={selectedStage.type}
                  onValueChange={(value) => updateStage('type', value as JourneyStageType)}
                >
                  <SelectTrigger aria-label="Journey stage type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stageTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
              <Label className="space-y-2">
                <span>Parent stage</span>
                <Select
                  value={selectedStage.parentStageId ?? noParentValue}
                  onValueChange={(value) =>
                    updateStage('parentStageId', value === noParentValue ? undefined : value)
                  }
                >
                  <SelectTrigger aria-label="Parent journey stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={noParentValue}>No parent stage</SelectItem>
                    {orderedStages
                      .filter((stage) => stage.id !== selectedStage.id)
                      .map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.code} · {stage.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Label>
              <Label className="flex items-center gap-3 rounded-md border border-border bg-background p-3">
                <input
                  className="h-4 w-4 rounded border-border"
                  type="checkbox"
                  checked={selectedStage.terminal}
                  onChange={(event) => updateStage('terminal', event.target.checked)}
                />
                This is an end stage
              </Label>
              <Label className="space-y-2">
                <span>Description</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedStage.description}
                  onChange={(event) => updateStage('description', event.target.value)}
                />
              </Label>

              <div className="space-y-3">
                <h3 className="font-medium text-foreground">Mapped activities</h3>
                {activities.length > 0 ? (
                  activities.map((activity) => (
                    <Label
                      key={activity.id}
                      className="flex items-start gap-3 rounded-md border border-border bg-background p-3"
                    >
                      <input
                        className="mt-1 h-4 w-4 rounded border-border"
                        type="checkbox"
                        checked={selectedStage.mappedActivityIds.includes(activity.id)}
                        onChange={() => toggleActivity(activity.id)}
                      />
                      <span>
                        <span className="block font-medium text-foreground">{activity.title}</span>
                        <span className="text-xs text-muted-foreground">
                          Existing activity stage: {activity.journeyStageId}
                        </span>
                      </span>
                    </Label>
                  ))
                ) : (
                  <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                    No project activities are available for mapping.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a stage to edit details.</p>
          )}
        </aside>
      </div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Branching preview</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {branchStages.length > 0 ? (
            branchStages.map((stage) => (
              <div key={stage.id} className="rounded-lg border border-border bg-background p-4">
                <StatusBadge tone="warning">{stage.code}</StatusBadge>
                <p className="mt-3 font-semibold text-foreground">{stage.name}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Parent:{' '}
                  {stages.find((item) => item.id === stage.parentStageId)?.name ?? 'Not assigned'}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              No branch stages are configured yet.
            </p>
          )}
        </div>
      </section>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save journey-stage configuration</DialogTitle>
            <DialogDescription>
              Confirm these changes for the current browser session. Shared project records are not
              changed.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium text-foreground">{project.title}</p>
            <p className="mt-1 text-muted-foreground">{stages.length} stages configured locally.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveConfiguration}>Confirm save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
