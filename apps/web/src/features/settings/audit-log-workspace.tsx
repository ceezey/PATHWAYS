'use client'

import { CalendarDays, FilterX, ScrollText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

type AuditEvent = {
  id: string
  at: string
  actor: string
  action: string
  module: string
  target: string
  outcome: 'Succeeded' | 'Denied' | 'Failed'
  summary: string
  correlationId: string
}

const events: AuditEvent[] = [
  {
    id: 'AUD-2026-0918',
    at: '2026-09-08T09:42:00+08:00',
    actor: 'System Administrator A',
    action: 'Updated role assignment',
    module: 'User Management',
    target: 'Project Officer C',
    outcome: 'Succeeded',
    summary: 'Added Youth RISE - Western Samar to the visible project scope.',
    correlationId: 'req-76d9f1',
  },
  {
    id: 'AUD-2026-0917',
    at: '2026-09-08T09:18:00+08:00',
    actor: 'Project Manager A',
    action: 'Attempted archive',
    module: 'Projects',
    target: 'FutureMakers NCR',
    outcome: 'Denied',
    summary: 'The current preview role did not have authority for the requested state change.',
    correlationId: 'req-44a218',
  },
  {
    id: 'AUD-2026-0916',
    at: '2026-09-08T08:55:00+08:00',
    actor: 'Monitoring and Evaluation Officer A',
    action: 'Reviewed evidence',
    module: 'Evidence',
    target: 'ACT-FM-02 / EV-184',
    outcome: 'Succeeded',
    summary: 'Marked the submitted attendance proof as reviewed in the prototype workspace.',
    correlationId: 'req-e23b01',
  },
  {
    id: 'AUD-2026-0915',
    at: '2026-09-07T16:31:00+08:00',
    actor: 'System',
    action: 'Import validation',
    module: 'Collection',
    target: 'youth-intake-september.csv',
    outcome: 'Failed',
    summary: 'Validation stopped because two required field mappings were missing.',
    correlationId: 'batch-f13a90',
  },
  {
    id: 'AUD-2026-0914',
    at: '2026-09-07T14:06:00+08:00',
    actor: 'Program Manager A',
    action: 'Viewed monitoring dashboard',
    module: 'Analytics',
    target: 'Portfolio / Q3 2026',
    outcome: 'Succeeded',
    summary: 'Opened the portfolio monitoring view with the Q3 reporting-period filter.',
    correlationId: 'req-91cd20',
  },
]

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

const outcomeTone = (outcome: AuditEvent['outcome']) => {
  if (outcome === 'Succeeded') return 'success'
  if (outcome === 'Denied') return 'warning'
  return 'danger'
}

export const AuditLogWorkspace = () => {
  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [outcomeFilter, setOutcomeFilter] = useState('All')
  const [selected, setSelected] = useState<AuditEvent | null>(null)

  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return events.filter((event) => {
      const matchesQuery =
        !normalizedQuery ||
        [event.actor, event.action, event.target, event.id].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        )
      return (
        matchesQuery &&
        (moduleFilter === 'All' || event.module === moduleFilter) &&
        (outcomeFilter === 'All' || event.outcome === outcomeFilter)
      )
    })
  }, [moduleFilter, outcomeFilter, query])

  const clearFilters = () => {
    setQuery('')
    setModuleFilter('All')
    setOutcomeFilter('All')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        description="Review significant account, project, evidence, collection, and monitoring events in chronological order."
      />

      <div className="rounded-lg border border-info/25 bg-info-subtle px-4 py-3 text-sm leading-6 text-info">
        This read-only preview uses synthetic events. Live event capture, retention, export, and
        access logging require the operational audit service.
      </div>

      <SectionCard
        title="Event filters"
        description="Narrow the visible preview without changing any audit record."
        actions={
          <Button onClick={clearFilters} size="sm" variant="outline">
            <FilterX className="mr-2 h-4 w-4" aria-hidden="true" />
            Clear filters
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="audit-search">Actor, action, target, or event ID</Label>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="audit-search"
                className="pl-9"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-module">Module</Label>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger id="audit-module">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['All', 'User Management', 'Projects', 'Evidence', 'Collection', 'Analytics'].map(
                  (item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-outcome">Outcome</Label>
            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger id="audit-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['All', 'Succeeded', 'Denied', 'Failed'].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Significant events"
        description={`${visibleEvents.length} synthetic event${visibleEvents.length === 1 ? '' : 's'} shown, newest first.`}
      >
        {visibleEvents.length ? (
          <section className="overflow-x-auto rounded-md border" aria-label="Audit events">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date and time</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {dateFormatter.format(new Date(event.at))}
                    </td>
                    <td className="px-4 py-3 font-medium">{event.actor}</td>
                    <td className="px-4 py-3">
                      <p>{event.action}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{event.target}</p>
                    </td>
                    <td className="px-4 py-3">{event.module}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={outcomeTone(event.outcome)}>{event.outcome}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(event)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <EmptyState
            icon={ScrollText}
            title="No events match these filters"
            description="Clear one or more filters to return to the chronological preview."
          />
        )}
      </SectionCard>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit event detail</DialogTitle>
            <DialogDescription>Read-only synthetic event context.</DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Event ID</dt>
                <dd className="mt-1 font-medium">{selected.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Recorded</dt>
                <dd className="mt-1 font-medium">{dateFormatter.format(new Date(selected.at))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Actor</dt>
                <dd className="mt-1 font-medium">{selected.actor}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Module</dt>
                <dd className="mt-1 font-medium">{selected.module}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Change summary</dt>
                <dd className="mt-1 leading-6">{selected.summary}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Outcome</dt>
                <dd className="mt-1">
                  <StatusBadge tone={outcomeTone(selected.outcome)}>{selected.outcome}</StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Correlation ID</dt>
                <dd className="mt-1 font-mono text-xs">{selected.correlationId}</dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
