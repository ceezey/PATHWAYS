'use client'

import { ShieldCheck } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { APP_NAME } from '@pathways/shared'

import { PrototypeRoleSwitcher } from '@/components/layout/prototype-role-switcher'
import { SidebarNavItem } from '@/components/layout/sidebar-nav-item'
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
        'flex h-full flex-col overflow-y-auto bg-[linear-gradient(180deg,#0a3d73_0%,#075a9c_48%,#082f5f_100%)] text-white',
        compact ? 'w-[86px]' : 'w-[292px]',
      )}
    >
      <div className={cn('border-b border-white/10 p-5', compact && 'px-3')}>
        <div className={cn('flex items-center gap-3', compact && 'justify-center')}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-lg font-bold text-[#075a9c] shadow-sm">
            P
          </div>
          {!compact ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-blue-100">PATHWAYS</p>
              <h1 className="truncate text-xl font-semibold tracking-tight">{APP_NAME}</h1>
              <p className="mt-1 text-xs leading-4 text-blue-50/70">
                Project Information Management
              </p>
            </div>
          ) : (
            <span className="sr-only">{APP_NAME}</span>
          )}
        </div>
      </div>
      <nav className={cn('flex-1 space-y-5 p-4', compact && 'px-3')} aria-label="Dashboard">
        {visibleNavGroups.map((group) => (
          <div key={group.id} className="space-y-2">
            {!compact ? (
              <p className="px-3 text-[0.68rem] font-semibold uppercase text-blue-100/80">
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
        <div className="rounded-lg border border-white/20 bg-slate-950/20 p-3">
          <div className={cn('flex items-start gap-3', compact && 'justify-center')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <ShieldCheck className="h-4 w-4 text-blue-100" aria-hidden="true" />
            </div>
            {!compact ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{email ?? 'Prototype user'}</p>
                <p className="mt-1 text-xs leading-4 text-blue-50/70">{roleLabel}</p>
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
