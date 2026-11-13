'use client'

import { useState } from 'react'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Input } from '@/components/ui/input'
import { SelectItem } from '@/components/ui/select'
import type { JourneyStageConfig } from '@/types/pathways'

import { formatDate, stageTypeTone } from '../../beneficiaries.utils'
import { FilterSelect } from '../../directory/components/filter-select'
import { type ParticipationHistoryEntry, filterParticipationHistory } from '../profile.utils'

export const RecordList = ({
  entries,
  stages,
  stageDisplayCode,
  projects,
  projectId,
  onProjectChange,
  title,
}: {
  entries: ParticipationHistoryEntry[]
  stages: JourneyStageConfig[]
  stageDisplayCode: (stage: JourneyStageConfig) => string
  projects: Array<{ id: string; title: string }>
  projectId: string
  onProjectChange: (projectId: string) => void
  title: string
}) => {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [stageId, setStageId] = useState('all')
  const visible = filterParticipationHistory(entries, { from, to, stageId })

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Input
          aria-label="History from"
          className="w-full sm:w-40"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          aria-label="History to"
          className="w-full sm:w-40"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <FilterSelect label="Stage" value={stageId} onValueChange={setStageId}>
          <SelectItem value="all">All stages</SelectItem>
          {stages
            .slice()
            .sort((first, second) => first.order - second.order)
            .map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {`${stageDisplayCode(stage)} ${stage.name}`}
              </SelectItem>
            ))}
        </FilterSelect>
        <FilterSelect
          label="Project"
          value={projectId}
          onValueChange={(id) => {
            if (id !== projectId) onProjectChange(id)
          }}
        >
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.title}
            </SelectItem>
          ))}
        </FilterSelect>
      </div>
      <div className="mt-4 space-y-3">
        {visible.length > 0 ? (
          visible.map((entry) => {
            const stage = stages.find((item) => item.id === entry.stageId)

            return (
              <div key={entry.id} className="rounded-lg border border-border bg-surface-subtle p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{entry.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(entry.date)} · {entry.detail}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {entry.result ? <StatusBadge tone="neutral">{entry.result}</StatusBadge> : null}
                    {stage ? (
                      <StatusBadge tone={stageTypeTone(stage.type)}>
                        {stageDisplayCode(stage)}
                      </StatusBadge>
                    ) : null}
                  </div>
                </div>
                {entry.note ? (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{entry.note}</p>
                ) : null}
              </div>
            )
          })
        ) : (
          <p className="rounded-lg border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
            {entries.length > 0
              ? 'No entries match these filters.'
              : 'No participation history is available for this coded profile.'}
          </p>
        )}
      </div>
    </section>
  )
}
