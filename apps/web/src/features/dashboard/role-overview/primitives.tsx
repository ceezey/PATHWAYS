import Link from 'next/link'
import { Children, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { greeting } from './health'

// Border and text color classes per KPI tone.
const accents = {
  danger: { border: 'border-l-danger', text: 'text-danger' },
  warning: { border: 'border-l-warning', text: 'text-warning' },
  info: { border: 'border-l-primary', text: 'text-primary' },
  success: { border: 'border-l-success', text: 'text-success' },
} as const

const actionClass =
  'mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline'

export const DashboardHeading = ({
  fullName,
  title,
  subtitle,
}: {
  fullName?: string | null
  title: string
  subtitle: string
}) => (
  <header className="space-y-1">
    <h1 className="font-heading text-3xl text-foreground">{greeting(new Date(), fullName)}</h1>
    <h2 className="pt-2 text-lg font-semibold text-primary">{title}</h2>
    <p className="text-sm text-muted-foreground">{subtitle}</p>
  </header>
)

export const KpiStrip = ({ children, label }: { children: ReactNode; label?: string }) => (
  <section aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {children}
  </section>
)

export const AccentKpi = ({
  label,
  value,
  sub,
  tone,
  action,
}: {
  label: string
  value: string
  sub: string
  tone: keyof typeof accents
  action?: { label: string; href?: string; onClick?: () => void }
}) => (
  <div
    className={cn('rounded-xl border border-l-4 border-border bg-card p-4', accents[tone].border)}
  >
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={cn('mt-1 text-3xl font-semibold tabular-nums', accents[tone].text)}>{value}</p>
    <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
    {action?.href ? (
      <Link className={actionClass} href={action.href}>
        {action.label}
      </Link>
    ) : action?.onClick ? (
      <button className={actionClass} onClick={action.onClick} type="button">
        {action.label}
      </button>
    ) : null}
  </div>
)

export const ListCard = ({
  title,
  viewAll,
  empty,
  children,
}: {
  title: string
  viewAll?: { label: string; href: string }
  empty: string
  children: ReactNode
}) => (
  <section className="rounded-xl border border-border bg-card">
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {viewAll ? (
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
          href={viewAll.href}
        >
          {viewAll.label}
        </Link>
      ) : null}
    </div>
    <div className="divide-y divide-border px-4">
      {Children.count(children) ? (
        children
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  </section>
)

export const InitialsBadge = ({ text }: { text: string }) => (
  <span
    aria-hidden="true"
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary"
  >
    {text.slice(0, 2).toUpperCase()}
  </span>
)

export const ListRow = ({
  lead,
  title,
  meta,
  trailing,
  onOpen,
  href,
}: {
  lead?: ReactNode
  title: string
  meta: string
  trailing?: ReactNode
  onOpen?: () => void
  href?: string
}) => {
  const body = (
    <span className="min-w-0 text-left">
      <span className="block truncate text-sm font-medium text-primary">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">{meta}</span>
    </span>
  )
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      {lead}
      {onOpen ? (
        <button
          className="min-h-11 min-w-0 flex-1 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onOpen}
          type="button"
        >
          {body}
        </button>
      ) : href ? (
        <Link
          className="flex min-h-11 min-w-0 flex-1 items-center rounded-sm hover:underline"
          href={href}
        >
          {body}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  )
}
