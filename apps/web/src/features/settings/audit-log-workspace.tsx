'use client'

import { transactDemo } from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import { CalendarDays, FilterX, ScrollText, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  const demo = useDemoState()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [accessError, setAccessError] = useState('')
  const logged = useRef(false)
  const events: AuditEvent[] = useMemo(
    () =>
      demo.audits
        .slice()
        .reverse()
        .map((e) => ({
          ...e,
          target: e.entityId ?? e.projectId ?? 'Workspace',
          summary: e.details,
          correlationId: e.id,
          outcome:
            e.outcome === 'Success' ? 'Succeeded' : e.outcome === 'Denied' ? 'Denied' : 'Failed',
        })),
    [demo.audits],
  )
  useEffect(() => {
    if (logged.current) return
    logged.current = true
    try {
      transactDemo('audit.view', undefined, undefined, (state) => {
        if (state.scenario === 'retrieval-failure')
          throw new Error('Demo audit retrieval failed. Clear the scenario and retry.')
      })
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Audit access failed.')
    }
  }, [])

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
        (!from || event.at.slice(0, 10) >= from) &&
        (!to || event.at.slice(0, 10) <= to) &&
        (moduleFilter === 'All' || event.module === moduleFilter) &&
        (outcomeFilter === 'All' || event.outcome === outcomeFilter)
      )
    })
  }, [moduleFilter, outcomeFilter, query, from, to, events])

  const clearFilters = () => {
    setQuery('')
    setFrom('')
    setTo('')
    setPage(0)
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
        Demo data: this read-only ledger records actual local actions. Viewing it records one access
        event.
      </div>

      {accessError ? (
        <div role="alert">
          {accessError}
          <Button onClick={() => window.location.reload()}>Retry audit access</Button>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor="audit-from-date">
          From date
          <Input
            id="audit-from-date"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(0)
            }}
          />
        </label>
        <label htmlFor="audit-to-date">
          To date
          <Input
            id="audit-to-date"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(0)
            }}
          />
        </label>
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
                {['All', ...new Set(events.map((e) => e.module))].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
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
        {visibleEvents.length && !accessError ? (
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
                {visibleEvents.slice(page * 10, (page + 1) * 10).map((event) => (
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

      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous page
        </Button>
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(visibleEvents.length / 10))}
        </span>
        <Button
          variant="outline"
          disabled={(page + 1) * 10 >= visibleEvents.length}
          onClick={() => setPage(page + 1)}
        >
          Next page
        </Button>
      </div>
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
