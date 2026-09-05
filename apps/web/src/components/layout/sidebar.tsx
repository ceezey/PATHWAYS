'use client'

import { ShieldCheck } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { PrototypeRoleSwitcher } from '@/components/layout/prototype-role-switcher'
import { SidebarNavItem } from '@/components/layout/sidebar-nav-item'
import { BrandMark } from '@/components/pathways'
import { createDashboardNavGroups } from '@/constants/navigation'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { useSession } from '@/hooks/use-session'
import { filterDashboardNavGroups } from '@/lib/rbac/route-access'
import { cn } from '@/lib/utils'
import { getPrototypeRoleDisplayName } from '@/types/prototype-role'

export const Sidebar = ({
  compact = false,
  onNavigate,
}: {
  compact?: boolean
  onNavigate?: () => void
}) => {
  const pathname = usePathname()
  const { email } = useSession()
  const { role } = usePrototypeRole()
  const visibleNavGroups = filterDashboardNavGroups(createDashboardNavGroups(), role)
  const roleLabel = getPrototypeRoleDisplayName(role)
  const activeHref = visibleNavGroups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href

  return (
    <aside
      className={cn(
        'flex h-full flex-col overflow-y-auto bg-navy text-navy-foreground',
        compact ? 'w-[86px]' : 'w-[292px]',
      )}
    >
      <div className={cn('border-b border-white/10 p-5', compact && 'px-3')}>
        <div className={cn('flex items-center gap-3', compact && 'justify-center')}>
          <BrandMark className="h-11 w-11 brightness-0 invert" priority />
          {!compact ? (
            <div className="min-w-0">
              <p className="truncate font-heading text-xl font-normal tracking-normal">PATHWAYS</p>
              <p className="mt-1 text-[13px] leading-5 text-navy-muted">
                Project Information Management
              </p>
            </div>
          ) : (
            <span className="sr-only">PATHWAYS Project Information Management</span>
          )}
        </div>
      </div>
      <nav className={cn('flex-1 space-y-5 p-4', compact && 'px-3')} aria-label="Dashboard">
        {visibleNavGroups.map((group) => (
          <div key={group.id} className="space-y-2">
            {!compact ? (
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.04em] text-navy-muted">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === activeHref

                return (
                  <SidebarNavItem
                    key={item.href}
                    active={active}
                    compact={compact}
                    item={item}
                    onNavigate={onNavigate}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className={cn('space-y-3 border-t border-white/10 p-4', compact && 'px-3')}>
        <PrototypeRoleSwitcher compact={compact} />
        <div className="border-t border-white/10 px-3 pt-3">
          <div className={cn('flex items-start gap-3', compact && 'justify-center')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-white/15">
              <ShieldCheck className="h-4 w-4 text-navy-muted" aria-hidden="true" />
            </div>
            {!compact ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{email ?? 'Prototype user'}</p>
                <p className="mt-1 text-[13px] leading-[18px] text-navy-muted">{roleLabel}</p>
              </div>
            ) : (
              <span className="sr-only">{email ?? 'Prototype user'}</span>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
