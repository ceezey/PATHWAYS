'use client'

import { Flag, Loader2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { SectionCard, StatusBadge } from '@/components/pathways'
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
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectMilestone } from '@/types/pathways'

const milestoneStatusLabels: Record<ProjectMilestone['status'], string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const milestoneTone = (status: ProjectMilestone['status']) => {
  if (status === 'COMPLETED') return 'success' as const
  if (status === 'IN_PROGRESS') return 'info' as const
  if (status === 'CANCELLED') return 'neutral' as const
  return 'warning' as const
}

const MilestoneDialog = ({
  projectId,
  milestone,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string
  milestone: ProjectMilestone | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (value: ProjectMilestone) => void
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [status, setStatus] = useState<ProjectMilestone['status']>('PENDING')
  const [completionDate, setCompletionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(milestone?.title ?? '')
    setDescription(milestone?.description ?? '')
    setTargetDate(milestone?.targetDate ?? '')
    setStatus(milestone?.status ?? 'PENDING')
    setCompletionDate(milestone?.completionDate ?? '')
    setError('')
  }, [open, milestone])

  const save = async () => {
    if (title.trim().length < 3) {
      setError('Milestone title must contain at least 3 characters.')
      return
    }
    if (status === 'COMPLETED' && !completionDate) {
      setError('A completed milestone requires a completion date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = milestone
        ? await pathwaysClient.updateMilestone(projectId, milestone.id, {
            title: title.trim(),
            description: description.trim() || undefined,
            targetDate: targetDate || undefined,
            status,
            completionDate: status === 'COMPLETED' ? completionDate : undefined,
            expectedUpdatedAt: milestone.updatedAt,
          })
        : await pathwaysClient.createMilestone(projectId, {
            title: title.trim(),
            description: description.trim() || undefined,
            targetDate: targetDate || undefined,
          })
      toast.success(milestone ? 'Milestone updated.' : 'Milestone created.')
      onSaved(saved)
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof PathwaysClientError ? caught.message : 'Milestone could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{milestone ? 'Update milestone' : 'Create milestone'}</DialogTitle>
          <DialogDescription>
            Milestones are stored with project scope and optimistic update checks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-2">
            <span>Title</span>
            <Input
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          <Label className="space-y-2">
            <span>Description</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Label>
          <Label className="space-y-2">
            <span>Target date</span>
            <Input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </Label>
          {milestone ? (
            <>
              <Label className="space-y-2">
                <span>Status</span>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as ProjectMilestone['status'])}
                >
                  <SelectTrigger aria-label="Milestone status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(milestoneStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Label>
              {status === 'COMPLETED' ? (
                <Label className="space-y-2">
                  <span>Completion date</span>
                  <Input
                    type="date"
                    value={completionDate}
                    onChange={(event) => setCompletionDate(event.target.value)}
                  />
                </Label>
              ) : null}
            </>
          ) : null}
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Flag className="h-4 w-4" aria-hidden="true" />
            )}
            Save milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const ProjectMilestonesSection = ({
  projectId,
  milestones,
  canManage,
  onSaved,
}: {
  projectId: string
  milestones: ProjectMilestone[]
  canManage: boolean
  onSaved: (value: ProjectMilestone) => void
}) => {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ProjectMilestone | null>(null)

  const edit = (milestone: ProjectMilestone) => {
    if (!canManage) return
    setSelected(milestone)
    setOpen(true)
  }

  const create = () => {
    if (!canManage) return
    setSelected(null)
    setOpen(true)
  }

  return (
    <>
      <SectionCard
        title="Project milestones"
        description="Persisted target dates, lifecycle status, and completion dates."
        actions={
          canManage ? (
            <Button size="sm" className="gap-2" type="button" onClick={create}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add milestone
            </Button>
          ) : undefined
        }
      >
        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No milestones are recorded for this project.
          </p>
        ) : (
          <div className="space-y-3">
            {milestones.map((milestone) => (
              <button
                key={milestone.id}
                type="button"
                disabled={!canManage}
                onClick={() => edit(milestone)}
                className="flex w-full flex-col gap-2 rounded-lg border border-border bg-background p-4 text-left disabled:cursor-default sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{milestone.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Target: {milestone.targetDate || 'Not set'}
                    {milestone.completionDate ? ` · Completed: ${milestone.completionDate}` : ''}
                  </p>
                </div>
                <StatusBadge tone={milestoneTone(milestone.status)}>
                  {milestoneStatusLabels[milestone.status]}
                </StatusBadge>
              </button>
            ))}
          </div>
        )}
      </SectionCard>
      <MilestoneDialog
        projectId={projectId}
        milestone={selected}
        open={open}
        onOpenChange={setOpen}
        onSaved={onSaved}
      />
    </>
  )
}
