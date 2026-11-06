import type { RoleOverview } from '@pathways/shared'
import type { ReactNode } from 'react'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { AccentKpi, DashboardHeading, KpiStrip, ListCard, ListRow } from './primitives'

type Data = RoleOverview
const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
const importStatus = {
  FAILED: ['Failed', 'danger'],
  RECOVERY_REQUIRED: ['Needs recovery', 'warning'],
  VALIDATED: ['Ready to process', 'info'],
} as const
const severityTone = { CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'info' } as const

const Item = ({
  title,
  text,
  action,
  onAction,
  badge,
}: {
  title: string
  text: string
  action: string
  onAction: () => void
  badge?: ReactNode
}) => (
  <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-subtle p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {badge}
    </div>
    <p className="text-sm text-foreground">{text}</p>
    <Button onClick={onAction} size="sm" type="button">
      {action}
    </Button>
  </div>
)

const anotherAdmin = <StatusBadge tone="neutral">Needs another admin</StatusBadge>

/** System Administrator home: forms, publications, imports and rules waiting on an admin. */
export const AdminOverview = ({
  data,
  fullName,
  onOpen,
}: {
  data: Data
  fullName?: string | null
  onOpen: (href: string) => void
}) => {
  const { formDrafts, publicationQueue, importAttention, ruleDrafts, alerts } = data
  const queues = [formDrafts, publicationQueue, importAttention, ruleDrafts]
  const more = queues.some((queue) => queue && queue.count > queue.rows.length)
  const empty = queues.every((queue) => !queue?.rows.length)
  return (
    <div className="space-y-6">
      <DashboardHeading
        fullName={fullName}
        subtitle={longDate(data.businessDate)}
        title="System administration overview"
      />
      <KpiStrip label="Administration counts">
        {formDrafts ? (
          <AccentKpi
            action={{ label: 'View', href: '/collection/forms' }}
            label="Form drafts"
            sub="Waiting to be published"
            tone="warning"
            value={String(formDrafts.count)}
          />
        ) : null}
        {publicationQueue ? (
          <AccentKpi
            action={{ label: 'View', href: '/transparency' }}
            label="Public dashboard approvals"
            sub="To approve or publish"
            tone="info"
            value={String(publicationQueue.count)}
          />
        ) : null}
        {importAttention ? (
          <AccentKpi
            action={{ label: 'View', href: '/collection/import' }}
            label="Imports needing attention"
            sub="Failed or ready to process"
            tone="danger"
            value={String(importAttention.count)}
          />
        ) : null}
        {alerts ? (
          <AccentKpi
            action={{ label: 'View', href: '/alerts' }}
            label="Open alerts"
            sub={`${alerts.bySeverity.CRITICAL + alerts.bySeverity.HIGH} critical or high`}
            tone="info"
            value={`${alerts.open}${alerts.capped ? '+' : ''}`}
          />
        ) : null}
      </KpiStrip>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Needs your attention</h3>
          {formDrafts?.rows.map((row) => (
            <Item
              action="Open draft"
              badge={row.ownEdit ? anotherAdmin : undefined}
              key={row.formId}
              onAction={() => onOpen(`/collection/projects/${row.projectId}/forms/${row.formId}`)}
              text={`${row.projectTitle} · version ${row.version} is waiting to be published.`}
              title={`Form draft · ${row.name}`}
            />
          ))}
          {publicationQueue?.rows.map((row) => (
            <Item
              action={row.state === 'FOR_REVIEW' ? 'Approve' : 'Publish'}
              badge={row.ownSubmission ? anotherAdmin : undefined}
              key={row.projectId}
              onAction={() => onOpen(`/projects/${row.projectId}/transparency`)}
              text={`Submitted by ${row.submittedByName}. ${row.state === 'FOR_REVIEW' ? 'Waiting for approval.' : 'Approved and ready to publish.'}`}
              title={`Public dashboard · ${row.projectTitle}`}
            />
          ))}
          {importAttention?.rows.map((row) => {
            const [text, tone] = importStatus[row.status]
            return (
              <Item
                action="Open import"
                badge={<StatusBadge tone={tone}>{text}</StatusBadge>}
                key={row.batchId}
                onAction={() =>
                  onOpen(`/collection/import?project=${row.projectId}&batch=${row.batchId}`)
                }
                text={row.projectTitle}
                title={`Import · ${[row.fileName, row.partCode].filter(Boolean).join(' · ')}`}
              />
            )
          })}
          {ruleDrafts?.rows.map((row) => (
            <Item
              action="Open rules"
              key={row.ruleId}
              onAction={() => onOpen('/settings/rules')}
              text={`Version ${row.version} is waiting to be activated.`}
              title={`Alert rule draft · ${row.code} ${row.name}`}
            />
          ))}
          {more ? (
            <p className="text-sm text-muted-foreground">
              More items are waiting. Use View on each count to see them all.
            </p>
          ) : null}
          {empty ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing needs your attention.
            </p>
          ) : null}
        </section>
        {alerts ? (
          <ListCard
            empty="No open alerts."
            title="Recent alerts"
            viewAll={{ label: 'View all', href: '/alerts' }}
          >
            {alerts.recent.map((row) => (
              <ListRow
                href={`/alerts?alert=${row.id}`}
                key={row.id}
                meta={row.explanation}
                title={row.title}
                trailing={
                  row.severity ? (
                    <StatusBadge tone={severityTone[row.severity]}>{row.severity}</StatusBadge>
                  ) : null
                }
              />
            ))}
          </ListCard>
        ) : null}
      </div>
    </div>
  )
}
