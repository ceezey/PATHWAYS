'use client'
import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasAction } from '@/lib/demo-state/permissions'
import { approveProgress } from '@/lib/demo-state/projects'
import { currentAccount, nextId, transactDemo } from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import { useState } from 'react'

export function MilestoneProgressPanel({ projectId }: { projectId: string }) {
  const demo = useDemoState()
  const actor = currentAccount(demo)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [actualDate, setActualDate] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const run = (operation: () => void) => {
    try {
      operation()
      setMessage('Project monitoring state updated and recorded in the audit trail.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not update progress.')
    }
  }
  if (!actor?.projectIds.includes(projectId)) return null
  return (
    <div className="space-y-4">
      <SectionCard title="Milestones">
        {hasAction(actor.role, 'activities.edit') ? (
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault()
              run(() =>
                transactDemo('activities.edit', projectId, undefined, (state) => {
                  if (!title.trim() || !Number.isFinite(Date.parse(date)))
                    throw new Error('Milestone title and planned date are required.')
                  if (state.projects.find((p) => p.id === projectId)?.archived)
                    throw new Error('Archived projects are read-only.')
                  state.milestones.push({
                    id: nextId(state, 'milestone'),
                    projectId,
                    title,
                    date,
                    actualDate,
                    completed: Boolean(actualDate),
                    varianceReviewed: false,
                  })
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
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label htmlFor="milestone-planned-date">
              Planned completion
              <Input
                id="milestone-planned-date"
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label htmlFor="milestone-actual-date">
              Actual completion
              <Input
                id="milestone-actual-date"
                type="date"
                value={actualDate}
                onChange={(e) => setActualDate(e.target.value)}
              />
            </label>
            <Button type="submit">Save milestone</Button>
          </form>
        ) : null}
        <ul className="mt-4 space-y-3">
          {demo.milestones
            .filter((m) => m.projectId === projectId)
            .map((m) => (
              <li className="rounded border p-3" key={m.id}>
                <strong>{m.title}</strong>
                <p>
                  Planned: {m.date} · Actual: {m.actualDate || 'Not completed'}
                </p>
                <StatusBadge tone={m.completed ? 'success' : 'info'}>
                  {m.completed ? 'Completed' : 'Planned'}
                </StatusBadge>
                {m.actualDate && m.actualDate !== m.date ? (
                  <p>
                    Completion-date variance ·{' '}
                    {m.varianceReviewed ? 'Reviewed by M&E' : 'For M&E review'}
                  </p>
                ) : null}
                {actor.role === 'Monitoring and Evaluation Officer' &&
                m.actualDate !== m.date &&
                !m.varianceReviewed ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(() =>
                        transactDemo('milestones.review', projectId, m.id, (state) => {
                          const record = state.milestones.find((item) => item.id === m.id)
                          if (!record) throw new Error('Milestone not found.')
                          record.varianceReviewed = true
                        }),
                      )
                    }
                  >
                    Review milestone variance
                  </Button>
                ) : null}
                {hasAction(actor.role, 'activities.edit') && !m.completed ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(() =>
                        transactDemo('activities.edit', projectId, m.id, (state) => {
                          if (!actualDate) throw new Error('Choose actual completion date above.')
                          const record = state.milestones.find((item) => item.id === m.id)
                          if (!record) throw new Error('Milestone not found.')
                          record.actualDate = actualDate
                          record.completed = true
                        }),
                      )
                    }
                  >
                    Mark completed using selected date
                  </Button>
                ) : null}
              </li>
            ))}
        </ul>
      </SectionCard>
      {hasAction(actor.role, 'progress.review') ? (
        <SectionCard title="Activity progress approval">
          <label htmlFor="progress-correction-reason">
            Correction reason (required for returns)
            <Input
              id="progress-correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <ul className="mt-4 space-y-3">
            {demo.activities
              .filter((a) => a.projectId === projectId)
              .map((a) => (
                <li className="rounded border p-3" key={a.id}>
                  <p>
                    {a.title} · {a.progress}% · {a.progressApproval ?? a.status}
                  </p>
                  {a.correctionReason ? <p>{a.correctionReason}</p> : null}
                  <div className="mt-2 flex gap-3">
                    <Button onClick={() => run(() => approveProgress(a.id, true))}>
                      Approve progress
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => run(() => approveProgress(a.id, false, reason))}
                    >
                      Return progress for correction
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </SectionCard>
      ) : null}
      <output className="block">{message}</output>
    </div>
  )
}
