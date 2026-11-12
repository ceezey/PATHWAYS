'use client'

import { AUDIT_MODULES, auditModuleOf } from '@pathways/shared'
import { FilterX, ScrollText, Search } from 'lucide-react'
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
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type AuditFilters, auditClient, auditSearch } from '@/lib/api/audit'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'

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
  details: Record<string, string | number | boolean>
}

const detailLabels: Record<string, string> = { source: 'Source', rowNumber: 'Row number' }

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
const AuditContent = ({ authorized }: { authorized: boolean }) => {
  const [filters, setFilters] = useState<AuditFilters>({})
  const [draft, setDraft] = useState('')
  const [page, setPage] = useState(0)
  const [cursor, setCursor] = useState<string | undefined>()
  const [outcomeFilter, setOutcomeFilter] = useState('All')
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const { from, to } = filters
  const rangeReversed = Boolean(from && to && from > to)
  const read = useAuthorizedRead(
    `audit-events:${auditSearch(filters, cursor) || 'first'}`,
    null,
    'audit.read',
    (signal) => auditClient.list(filters, cursor, signal),
    !rangeReversed,
  )
  // Every applied filter change returns to the first server page and first table page.
  const apply = (patch: AuditFilters) => {
    setFilters({ ...filters, ...patch })
    setCursor(undefined)
    setPage(0)
    setSelected(null)
  }
  const accessError = read.isError ? 'Current audit access could not be verified.' : ''
  const loading = !rangeReversed && !read.isError && read.isPending
  const currentData =
    authorized && !rangeReversed && !read.isError && !read.isPending ? read.data : undefined
  const events: AuditEvent[] = (currentData?.rows ?? []).map((row) => ({
    id: row.id,
    at: row.occurredAt,
    actor: row.actorName ?? (row.actorUserId ? 'Unknown user' : 'System'),
    actorId: row.actorUserId,
    action: row.action,
    module: auditModuleOf(row.entityType).label,
    target: row.entityId ?? 'No record ID',
    outcome: 'Recorded',
    summary: `${row.action} recorded for ${row.entityType}.`,
    details: row.details,
  }))

  const selectedCurrent = Boolean(currentData?.rows.some((row) => row.id === selected?.id))
  useEffect(() => {
    if (!selectedCurrent) setSelected(null)
  }, [selectedCurrent])

  const visibleEvents = events.filter(
    (event) => outcomeFilter === 'All' || event.outcome === outcomeFilter,
  )

  const clearFilters = () => {
    setDraft('')
    setOutcomeFilter('All')
    apply({ module: undefined, from: undefined, to: undefined, q: undefined })
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
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                apply({ q: draft.trim() || undefined })
              }}
            >
              <span className="relative block flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="audit-search"
                  className="pl-9"
                  type="search"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </span>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-module">Module</Label>
            <Select
              value={filters.module ?? 'All'}
              onValueChange={(value) =>
                apply({ module: value === 'All' ? undefined : (value as AuditFilters['module']) })
              }
            >
              <SelectTrigger id="audit-module">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                {AUDIT_MODULES.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
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
              value={from ?? ''}
              onChange={(e) => apply({ from: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-to-date">To date</Label>
            <Input
              id="audit-to-date"
              type="date"
              value={to ?? ''}
              onChange={(e) => apply({ to: e.target.value || undefined })}
            />
          </div>
        </div>
        {rangeReversed ? (
          <p className="mt-2 text-sm text-destructive">
            Choose a From date on or before the To date.
          </p>
        ) : null}
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
            description={accessError || 'No recorded events match these filters.'}
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
              {Object.entries(selected.details).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-muted-foreground">{detailLabels[key] ?? key}</dt>
                  <dd className="mt-1 font-medium">{String(value)}</dd>
                </div>
              ))}
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
