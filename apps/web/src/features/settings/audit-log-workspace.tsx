'use client'

import { CalendarDays, FilterX, ScrollText, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, LoadingSkeleton, SectionCard, StatusBadge } from '@/components/pathways'
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
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { coreDataClient } from '@/lib/services/core-feature-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

type AuditEvent = {
  id: string
  at: string
  actor: string
  actorId: string | null
  action: string
  module: string
  target: string
  outcome: 'Recorded'
  summary: string
}

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

const outcomeTone = (_outcome: AuditEvent['outcome']) => 'neutral' as const

export const AuditLogWorkspace = () => {
  const { profile } = useCurrentRole()
  const owner = useSensitiveDraftOwner(profile, 'audit-screen', 'audit.read', null, null)
  return (
    <AuditContent
      key={`${owner?.key ?? 'unavailable'}:${owner?.generation ?? 0}`}
      authorized={Boolean(owner)}
    />
  )
}
const businessDate = (timestamp: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
const AuditContent = ({ authorized }: { authorized: boolean }) => {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [cursor, setCursor] = useState<string | undefined>()
  const read = useAuthorizedRead(
    `audit-events:${cursor ?? 'first'}`,
    null,
    'audit.read',
    (signal) => coreDataClient.audit(cursor, signal),
  )
  const accessError = read.isError ? 'Current audit access could not be verified.' : ''
  const loading = !read.isError && read.isPending
  const currentData = authorized && !read.isError && !read.isPending ? read.data : undefined
  const events: AuditEvent[] = (currentData?.rows ?? []).map((row) => ({
    id: row.id,
    at: row.occurredAt,
    actor: row.actorName ?? (row.actorUserId ? 'Unknown user' : 'System'),
    actorId: row.actorUserId,
    action: row.action,
    module: row.entityType,
    target: row.entityId ?? 'No record ID',
    outcome: 'Recorded',
    summary: `${row.action} recorded for ${row.entityType}.`,
  }))

  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [outcomeFilter, setOutcomeFilter] = useState('All')
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const selectedCurrent = Boolean(currentData?.rows.some((row) => row.id === selected?.id))
  useEffect(() => {
    if (!selectedCurrent) setSelected(null)
  }, [selectedCurrent])

  const visibleEvents = (() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return events.filter((event) => {
      const matchesQuery =
        !normalizedQuery ||
        [event.actor, event.actorId, event.action, event.target, event.id]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      return (
        matchesQuery &&
        (!from || businessDate(event.at) >= from) &&
        (!to || businessDate(event.at) <= to) &&
        (moduleFilter === 'All' || event.module === moduleFilter) &&
        (outcomeFilter === 'All' || event.outcome === outcomeFilter)
      )
    })
  })()

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
      <PageHeader title="Audit Log" />

      {accessError ? (
        <div role="alert">
          {accessError}
          <Button onClick={() => void read.refetch()}>Retry audit access</Button>
        </div>
      ) : null}
      <SectionCard
        title="Event filters"
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
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(0)
                }}
              />
            </span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-module">Module</Label>
            <Select
              value={currentData ? moduleFilter : 'All'}
              onValueChange={(value) => {
                setModuleFilter(value)
                setPage(0)
              }}
            >
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
            <Select
              value={outcomeFilter}
              onValueChange={(value) => {
                setOutcomeFilter(value)
                setPage(0)
              }}
            >
              <SelectTrigger id="audit-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['All', 'Recorded'].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="audit-from-date">From date</Label>
            <Input
              id="audit-from-date"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(0)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-to-date">To date</Label>
            <Input
              id="audit-to-date"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(0)
              }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Significant events" description={accessError}>
        {loading ? (
          <LoadingSkeleton />
        ) : visibleEvents.length && !accessError ? (
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
                    <td className="px-4 py-3 font-medium" title={event.actorId ?? undefined}>
                      {event.actor}
                      {event.actor === 'Unknown user' ? (
                        <p className="mt-1 text-xs font-normal text-muted-foreground">
                          {event.actorId}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p>{event.action}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{event.target}</p>
                    </td>
                    <td className="px-4 py-3">{event.module}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={outcomeTone(event.outcome)}>{event.outcome}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`View ${event.action} for ${event.target}, event ${event.id}`}
                        onClick={() => setSelected(event)}
                      >
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
            title={accessError ? 'Audit records unavailable' : 'No matching audit records'}
            description={accessError || 'No recorded events match the filters on this page.'}
          />
        )}
      </SectionCard>

      {!accessError && !loading ? (
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
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!cursor}
          onClick={() => {
            setCursor(undefined)
            setPage(0)
            setSelected(null)
          }}
        >
          Latest events
        </Button>
        <Button
          variant="outline"
          disabled={!currentData?.nextCursor}
          onClick={() => {
            if (currentData?.nextCursor) {
              setCursor(currentData.nextCursor)
              setPage(0)
              setSelected(null)
            }
          }}
        >
          Load older events
        </Button>
      </div>
      <Dialog
        open={Boolean(selected) && selectedCurrent}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit event detail</DialogTitle>
            <DialogDescription>Read-only event context.</DialogDescription>
          </DialogHeader>
          {selected && selectedCurrent ? (
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
                <dd className="mt-1 font-medium" title={selected.actorId ?? undefined}>
                  {selected.actor}
                  {selected.actor === 'Unknown user' ? (
                    <p className="mt-1 text-xs font-normal text-muted-foreground">
                      {selected.actorId}
                    </p>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Module</dt>
                <dd className="mt-1 font-medium">{selected.module}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Recorded action</dt>
                <dd className="mt-1 leading-6">{selected.summary}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Outcome</dt>
                <dd className="mt-1">
                  <StatusBadge tone={outcomeTone(selected.outcome)}>{selected.outcome}</StatusBadge>
                </dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
