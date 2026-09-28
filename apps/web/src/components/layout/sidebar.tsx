'use client'

import { PanelLeftClose, PanelLeftOpen, ShieldCheck } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { SidebarNavItem } from '@/components/layout/sidebar-nav-item'
import { BrandMark } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { createDashboardNavGroups } from '@/constants/navigation'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { getAccessScopeLabel } from '@/lib/auth/access-context'
import { filterDashboardNavGroups } from '@/lib/rbac/route-access'
import { cn } from '@/lib/utils'
import { getPathwaysRoleDisplayName } from '@/types/pathways-role'

export const Sidebar = ({
  compact = false,
  onNavigate,
  onToggle,
}: {
  compact?: boolean
  onNavigate?: () => void
  onToggle?: () => void
}) => {
  const pathname = usePathname()
  const { email } = useSession()
  const { role, profile, assignedProjectIds } = useCurrentRole()
  const visibleNavGroups = filterDashboardNavGroups(
    createDashboardNavGroups(),
    role,
    profile
      ? { roles: profile.roles, permissions: profile.permissions, assignedProjectIds }
      : undefined,
  )
  const roleLabel = role ? getPathwaysRoleDisplayName(role) : 'Access pending'
  const scopeLabel = getAccessScopeLabel(role, assignedProjectIds)
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
        <div className={cn('flex items-center justify-between gap-3', compact && 'justify-center')}>
          {!compact ? (
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark className="h-11 w-11 brightness-0 invert" priority />
              <div className="min-w-0">
                <p className="truncate font-heading text-xl font-normal tracking-normal">
                  PATHWAYS
                </p>
                <p className="mt-1 text-[13px] leading-5 text-navy-muted">
                  Project Information Management
                </p>
              </div>
            </div>
          ) : (
            <span className="sr-only">PATHWAYS Project Information Management</span>
          )}
          {onToggle ? (
            <Button
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
              className="shrink-0 text-navy-foreground hover:bg-white/10 hover:text-navy-foreground focus-visible:ring-white focus-visible:ring-offset-navy"
              onClick={onToggle}
              size="icon"
              title={compact ? 'Expand sidebar' : 'Collapse sidebar'}
              variant="ghost"
            >
              {compact ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          ) : null}
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
        <div className="border-t border-white/10 px-3 pt-3">
          <div className={cn('flex items-start gap-3', compact && 'justify-center')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-white/15">
              <ShieldCheck className="h-4 w-4 text-navy-muted" aria-hidden="true" />
            </div>
            {!compact ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{email ?? 'Signed-in user'}</p>
                <p className="mt-1 text-[13px] leading-[18px] text-navy-muted">{roleLabel}</p>
                <p className="text-[12px] leading-[18px] text-navy-muted">{scopeLabel}</p>
              </div>
            ) : (
              <span className="sr-only">{email ?? 'Signed-in user'}</span>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
