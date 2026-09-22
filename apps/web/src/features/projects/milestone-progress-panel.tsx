'use client'

import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity, ProjectMilestone } from '@/types/pathways'
import { useEffect, useState } from 'react'

export function MilestoneProgressPanel({ projectId }: { projectId: string }) {
  const { role, profile, assignedProjectIds } = useCurrentRole()
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [actualDate, setActualDate] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!profile) return
    let active = true
    Promise.all([pathwaysClient.getMilestones(projectId), pathwaysClient.getActivities(projectId)])
      .then(([nextMilestones, nextActivities]) => {
        if (!active) return
        setMilestones(nextMilestones)
        setActivities(nextActivities)
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : 'Project progress could not be loaded.',
          )
      })
    return () => {
      active = false
    }
  }, [profile, projectId])

  const run = async (operation: () => Promise<ProjectMilestone>) => {
    try {
      const saved = await operation()
      setMilestones((current) => [...current.filter((row) => row.id !== saved.id), saved])
      setMessage('Milestone saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Milestone could not be saved.')
    }
  }

  if (
    !profile ||
    (!assignedProjectIds.includes(projectId) &&
      role !== 'System Administrator' &&
      role !== 'Program Manager' &&
      role !== 'Grant Manager')
  )
    return null

  return (
    <div className="space-y-4">
      <SectionCard title="Milestones">
        {isUiActionAvailable(role, 'activities.edit') ? (
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!title.trim() || !date) {
                setMessage('Milestone title and planned date are required.')
                return
              }
              void run(() =>
                pathwaysClient.createMilestone(projectId, {
                  title: title.trim(),
                  targetDate: date,
                }),
              )
            }}
          >
            <label htmlFor="milestone-title">
              Milestone title
              <Input
                id="milestone-title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label htmlFor="milestone-planned-date">
              Planned completion
              <Input
                id="milestone-planned-date"
                required
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label htmlFor="milestone-actual-date">
              Actual completion
              <Input
                id="milestone-actual-date"
                type="date"
                value={actualDate}
                onChange={(event) => setActualDate(event.target.value)}
              />
            </label>
            <Button type="submit">Save milestone</Button>
          </form>
        ) : null}
        <ul className="mt-4 space-y-3">
          {milestones.map((milestone) => (
            <li className="rounded border p-3" key={milestone.id}>
              <strong>{milestone.title}</strong>
              <p>
                Planned: {milestone.targetDate || 'Not recorded'} · Actual:{' '}
                {milestone.completionDate || 'Not completed'}
              </p>
              <StatusBadge tone={milestone.status === 'COMPLETED' ? 'success' : 'info'}>
                {milestone.status === 'COMPLETED' ? 'Completed' : 'Planned'}
              </StatusBadge>
              {milestone.completionDate && milestone.completionDate !== milestone.targetDate ? (
                <p>Completion-date variance · Review unavailable</p>
              ) : null}
              {role === 'Monitoring and Evaluation Officer' &&
              milestone.completionDate !== milestone.targetDate ? (
                <Button variant="outline" disabled>
                  Review milestone variance
                </Button>
              ) : null}
              {isUiActionAvailable(role, 'activities.edit') && milestone.status !== 'COMPLETED' ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!actualDate) {
                      setMessage('Choose actual completion date above.')
                      return
                    }
                    void run(() =>
                      pathwaysClient.updateMilestone(projectId, milestone.id, {
                        title: milestone.title,
                        description: milestone.description,
                        targetDate: milestone.targetDate,
                        completionDate: actualDate,
                        status: 'COMPLETED',
                        expectedUpdatedAt: milestone.updatedAt,
                      }),
                    )
                  }}
                >
                  Mark completed using selected date
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Activity progress approval">
        <label htmlFor="progress-correction-reason">
          Correction reason (required for returns)
          <Input
            id="progress-correction-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <ul className="mt-4 space-y-3">
          {activities.map((activity) => (
            <li className="rounded border p-3" key={activity.id}>
              <p>
                {activity.title} · {activity.progress}% · {activity.status}
              </p>
              <div className="mt-2 flex gap-3">
                <Button disabled>Approve progress</Button>
                <Button variant="outline" disabled>
                  Return progress for correction
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Standalone progress approval is unavailable. Submitted evidence uses the existing activity
          review API.
        </p>
      </SectionCard>
      <output className="block">{message}</output>
    </div>
  )
}
