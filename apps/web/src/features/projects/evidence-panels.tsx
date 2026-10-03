import { FileCheck2, FileText, Image as ImageIcon, Lock } from 'lucide-react'
import type { ReactNode } from 'react'

import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { cn } from '@/lib/utils'
import type { EvidenceRecord } from '@/types/pathways'
import { formatDate } from './activity-utils'

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const statusDisplay: Record<EvidenceRecord['status'], { label: string; tone: Tone }> = {
  Approved: { label: 'Approved', tone: 'success' },
  Validated: { label: 'Validated', tone: 'success' },
  Submitted: { label: 'Needs review', tone: 'warning' },
  Flagged: { label: 'Flagged', tone: 'danger' },
  Returned: { label: 'Returned', tone: 'danger' },
}

const tileTone: Record<Tone, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  neutral: 'bg-primary-subtle text-primary',
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const evidenceIcon = (
  record: Pick<EvidenceRecord, 'contentType' | 'isIdentifying' | 'status'>,
) =>
  record.isIdentifying
    ? Lock
    : record.contentType.startsWith('image/')
      ? ImageIcon
      : record.status === 'Approved' || record.status === 'Validated'
        ? FileCheck2
        : FileText

export const EvidenceAttachmentsCard = ({
  records,
  renderActions,
}: {
  records: EvidenceRecord[]
  renderActions: (record: EvidenceRecord) => ReactNode
}) => (
  <SectionCard
    title="Evidence & attachments"
    description="File + status + provenance"
    className="min-w-0"
  >
    {records.length > 0 ? (
      <ul className="space-y-3">
        {records.map((record) => {
          const Icon = evidenceIcon(record)
          const display = statusDisplay[record.status]
          return (
            <li
              key={record.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    tileTone[record.isIdentifying ? 'neutral' : display.tone],
                  )}
                  data-testid="evidence-icon"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-foreground">
                    {record.fileName}
                  </p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {formatBytes(record.byteSize)} · Uploaded by {record.submitter} ·{' '}
                    {formatDate(record.submittedDate)}
                  </p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {record.reportTitle}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <StatusBadge dot={false} tone={display.tone}>
                  {display.label}
                </StatusBadge>
                {renderActions(record)}
              </div>
            </li>
          )
        })}
      </ul>
    ) : (
      <EmptyState
        title="No evidence records"
        description="No evidence records are available for this project."
      />
    )}
  </SectionCard>
)

interface AuditEvent {
  key: string
  action: string
  actor: string
  date: string
  source: string
  tone: Tone | 'info'
}

/** Builds the trail only from timestamps and names already on evidence records. */
export const auditEvents = (records: EvidenceRecord[], limit = 6): AuditEvent[] =>
  records
    .flatMap((record): AuditEvent[] => {
      const events: AuditEvent[] = [
        {
          key: `${record.id}-uploaded`,
          action: 'Evidence uploaded',
          actor: record.submitter || 'Unknown user',
          date: record.submittedDate,
          source: record.fileName,
          tone: 'info',
        },
      ]
      if (record.reviewedDate && (record.status === 'Approved' || record.status === 'Returned')) {
        events.push({
          key: `${record.id}-reviewed`,
          action: record.status === 'Approved' ? 'Evidence approved' : 'Evidence returned',
          actor: record.reviewer ?? 'Unknown user',
          date: record.reviewedDate,
          source: record.fileName,
          tone: record.status === 'Approved' ? 'success' : 'danger',
        })
      }
      return events
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)

const dotTone: Record<AuditEvent['tone'], string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-muted-foreground',
}

export const AuditMetadataCard = ({ records }: { records: EvidenceRecord[] }) => {
  const events = auditEvents(records)
  return (
    <SectionCard title="Audit metadata" description="Immutable activity trail" className="min-w-0">
      {events.length > 0 ? (
        <ol className="space-y-0">
          {events.map((event, index) => (
            <li key={event.key} className="relative flex gap-3 pb-5 last:pb-0">
              {index < events.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[5px] top-4 bottom-0 w-px bg-border"
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-full', dotTone[event.tone])}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{event.action}</p>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {event.actor} · {formatDate(event.date)} · {event.source}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          title="No audit events"
          description="Evidence events appear here once proof is submitted."
        />
      )}
    </SectionCard>
  )
}
