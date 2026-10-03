'use client'

import { ArrowDown, ArrowUp, Download, MoreHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'

import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ActivitySummary } from '@/types/pathways'

import { activityStatusTone, formatDate } from './activity-utils'
import { toneFor } from './budget-module/budget-math'

type ColumnKey = 'code' | 'status' | 'dueDate' | 'beneficiaries' | 'indicators' | 'budget'

const columnLabels: Record<ColumnKey, string> = {
  code: 'Code',
  status: 'Status',
  dueDate: 'Due date',
  beneficiaries: 'Beneficiaries',
  indicators: 'Indicators',
  budget: 'Budget',
}
const columnKeys = Object.keys(columnLabels) as ColumnKey[]
const missing = '—'

const statusLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase()

const beneficiariesText = (activity: ActivitySummary) => {
  const { beneficiariesReached: reached, beneficiariesTarget: target } = activity
  if (reached == null && target == null) return missing
  return `${reached ?? missing} / ${target ?? missing}`
}

const budgetText = (activity: ActivitySummary) =>
  activity.budgetUtilization == null ? missing : `${activity.budgetUtilization}%`

const indicatorsText = (activity: ActivitySummary) =>
  String(activity.indicatorCount ?? activity.indicatorIds.length)

// A leading formula character is neutralized so spreadsheets never run exported text.
const csvCell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export const activitiesCsv = (rows: ActivitySummary[], columns: ColumnKey[]) => {
  const cells: Record<ColumnKey, (activity: ActivitySummary) => string> = {
    code: (a) => a.code ?? '',
    status: (a) => a.status,
    dueDate: (a) => a.dueDate,
    beneficiaries: beneficiariesText,
    indicators: indicatorsText,
    budget: budgetText,
  }
  const header = ['Activity', ...columns.map((key) => columnLabels[key])]
  const lines = rows.map((a) => [a.title, ...columns.map((key) => cells[key](a))])
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n')
}

const downloadCsv = (text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'activities.csv'
  link.click()
  URL.revokeObjectURL(url)
}

const headClass =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export const ActivityListTable = ({
  activities,
  onOpen,
  projectId,
}: {
  activities: ActivitySummary[]
  onOpen: (activity: ActivitySummary) => void
  projectId: string
}) => {
  const [hidden, setHidden] = useState<ReadonlySet<ColumnKey>>(new Set())
  const [descending, setDescending] = useState(false)
  const columns = columnKeys.filter((key) => !hidden.has(key))
  const rows = useMemo(() => {
    const sorted = [...activities].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    return descending ? sorted.reverse() : sorted
  }, [activities, descending])
  const toggle = (key: ColumnKey, visible: boolean) =>
    setHidden((current) => {
      const next = new Set(current)
      if (visible) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <SectionCard
      title="Activity list"
      description={`${activities.length} ${activities.length === 1 ? 'activity' : 'activities'} · sorted by due date`}
      actions={
        <>
          <span className="rounded-full border border-info/30 bg-info-subtle px-2.5 py-1 text-xs font-semibold text-info">
            List view
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" type="button" variant="outline">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columnKeys.map((key) => (
                <DropdownMenuCheckboxItem
                  checked={!hidden.has(key)}
                  key={key}
                  onCheckedChange={(checked) => toggle(key, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {columnLabels[key]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className="gap-2"
            onClick={() => downloadCsv(activitiesCsv(rows, columns))}
            size="sm"
            type="button"
            variant="outline"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </Button>
        </>
      }
    >
      <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border">
              {columns.includes('code') ? <th className={headClass}>Code</th> : null}
              <th className={headClass}>Activity</th>
              {columns.includes('status') ? <th className={headClass}>Status</th> : null}
              {columns.includes('dueDate') ? (
                <th aria-sort={descending ? 'descending' : 'ascending'} className={headClass}>
                  <button
                    className="inline-flex items-center gap-1 uppercase tracking-wide"
                    onClick={() => setDescending((value) => !value)}
                    type="button"
                  >
                    Due date
                    {descending ? (
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                </th>
              ) : null}
              {columns.includes('beneficiaries') ? (
                <th className={headClass}>Beneficiaries</th>
              ) : null}
              {columns.includes('indicators') ? (
                <th className={cn(headClass, 'text-center')}>Indicators</th>
              ) : null}
              {columns.includes('budget') ? (
                <th className={cn(headClass, 'text-right')}>Budget</th>
              ) : null}
              <th className={headClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((activity) => {
              const tone = toneFor(activity.budgetUtilization ?? null)
              return (
                <tr
                  aria-label={`Activity: ${activity.title}`}
                  className="h-14 border-b border-border last:border-0 hover:bg-muted"
                  key={activity.id}
                >
                  {columns.includes('code') ? (
                    <td className="px-4 text-muted-foreground">{activity.code ?? missing}</td>
                  ) : null}
                  <td className="px-4 py-2">
                    <a
                      className="font-semibold text-navy hover:underline"
                      href={`/projects/${projectId}/activities/${activity.id}`}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return
                        event.preventDefault()
                        onOpen(activity)
                      }}
                    >
                      {activity.title}
                    </a>
                    {activity.overdueExplanationNeeded ? (
                      <div className="mt-1">
                        <StatusBadge tone="warning">Overdue: explanation needed</StatusBadge>
                      </div>
                    ) : null}
                  </td>
                  {columns.includes('status') ? (
                    <td className="px-4">
                      <StatusBadge dot={false} tone={activityStatusTone(activity.status)}>
                        {statusLabel(activity.status)}
                      </StatusBadge>
                    </td>
                  ) : null}
                  {columns.includes('dueDate') ? (
                    <td
                      className={cn(
                        'whitespace-nowrap px-4',
                        activity.status === 'Overdue' && 'font-medium text-danger',
                      )}
                    >
                      {formatDate(activity.dueDate)}
                    </td>
                  ) : null}
                  {columns.includes('beneficiaries') ? (
                    <td className="whitespace-nowrap px-4">{beneficiariesText(activity)}</td>
                  ) : null}
                  {columns.includes('indicators') ? (
                    <td className="px-4 text-center">{indicatorsText(activity)}</td>
                  ) : null}
                  {columns.includes('budget') ? (
                    <td
                      className={cn(
                        'px-4 text-right font-semibold',
                        tone === 'danger' || tone === 'warning'
                          ? 'text-warning'
                          : 'text-foreground',
                      )}
                    >
                      {budgetText(activity)}
                    </td>
                  ) : null}
                  <td className="w-12 px-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`More actions for ${activity.title}`}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onOpen(activity)}>
                          View details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
