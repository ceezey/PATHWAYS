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
        'group flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        active
          ? 'border-white/25 bg-white/20 text-white shadow-sm'
          : 'border-transparent text-blue-50/80 hover:bg-white/10 hover:text-white',
        compact && 'justify-center px-2',
      )}
      href={item.href}
      onClick={onNavigate}
      title={compact ? item.label : undefined}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {compact ? <span className="sr-only">{item.label}</span> : null}
      {!compact ? (
        <span className="min-w-0">
          <span className="block truncate font-medium">{item.label}</span>
          <span className="mt-0.5 block text-xs leading-4 text-blue-50/60">{item.description}</span>
        </span>
      ) : null}
    </Link>
  )
}
