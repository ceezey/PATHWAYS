'use client'

import Link from 'next/link'

import type { DashboardNavItem } from '@/constants/navigation'
import { cn } from '@/lib/utils'

export const SidebarNavItem = ({
  item,
  active,
  compact = false,
  onNavigate,
}: {
  item: DashboardNavItem
  active: boolean
  compact?: boolean
  onNavigate?: () => void
}) => {
  const Icon = item.icon

  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-start gap-3 rounded-md border px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-transparent text-navy-muted hover:border-white/10 hover:bg-white/[0.08] hover:text-white',
        compact && 'justify-center px-2',
      )}
      href={item.href}
      onClick={onNavigate}
      title={compact ? item.label : item.description}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {compact ? <span className="sr-only">{item.label}</span> : null}
      {!compact ? (
        <span className="min-w-0 break-words font-medium leading-5">{item.label}</span>
      ) : null}
    </Link>
  )
}
