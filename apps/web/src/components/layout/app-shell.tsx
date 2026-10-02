'use client'

import { Bell, CircleUserRound, Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Sidebar } from '@/components/layout/sidebar'
import { SkipLink } from '@/components/layout/skip-link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { getDashboardNavigationLabel } from '@/constants/navigation'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { getAccessScopeLabel } from '@/lib/auth/access-context'
import { getVerifiedRouteAccess } from '@/lib/rbac/route-access'
import { cn } from '@/lib/utils'
import { getPathwaysRoleDisplayName } from '@/types/pathways-role'

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const [compact, setCompact] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { email, signOut } = useSession()
  const { role, profile, assignedProjectIds } = useCurrentRole()
  const roleLabel = role ? getPathwaysRoleDisplayName(role) : 'Access pending'
  const workspaceLabel = getDashboardNavigationLabel(pathname)
  const scopeLabel = getAccessScopeLabel(role, assignedProjectIds)
  const canOpenProfile = Boolean(
    profile && getVerifiedRouteAccess(profile, '/settings/profile').allowed,
  )
  const canOpenAlerts = Boolean(profile && getVerifiedRouteAccess(profile, '/alerts').allowed)
  const initials = accountInitials(profile?.fullName ?? email)

  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.assign('/staff/login')
    } catch (error) {
      toast.error('Sign out could not be completed.', {
        description: error instanceof Error ? error.message : 'Check the service and try again.',
      })
    }
  }

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[auto_1fr]">
      <SkipLink />
      <div className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:self-start">
        <Sidebar compact={compact} onToggle={() => setCompact((value) => !value)} />
      </div>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button className="lg:hidden" size="icon" variant="outline">
                    <Menu className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Open navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[292px] border-0 p-0 sm:max-w-none [&>button]:text-white [&>button]:hover:bg-white/10 [&>button]:hover:text-white [&>button]:focus-visible:ring-white [&>button]:focus-visible:ring-offset-navy"
                >
                  <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Open a section of the PATHWAYS workspace.
                  </SheetDescription>
                  <Sidebar onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <p className="truncate text-sm font-semibold text-foreground">{workspaceLabel}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {canOpenAlerts ? (
                <Button asChild size="icon" variant="outline">
                  <Link aria-label="Alerts" href="/alerts">
                    <Bell className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Account menu"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary transition-colors hover:bg-light-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    type="button"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Session</DropdownMenuLabel>
                  <DropdownMenuItem disabled>{email ?? 'No signed-in user'}</DropdownMenuItem>
                  <DropdownMenuItem disabled>{roleLabel}</DropdownMenuItem>
                  <DropdownMenuItem disabled>{scopeLabel}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {canOpenProfile ? (
                    <DropdownMenuItem asChild>
                      <Link className="gap-2" href="/settings/profile">
                        <CircleUserRound className="h-4 w-4" aria-hidden="true" />
                        My Profile
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => void handleSignOut()}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={cn('flex-1 bg-background px-4 py-6 md:px-8 md:py-8 2xl:px-16')}
        >
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  )
}

// Up to two initials from the profile name, falling back to the email's first letter.
const accountInitials = (name?: string | null) => {
  const parts = (name ?? '')
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(Boolean)
  return (
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0]?.[0] ?? '?')
  ).toUpperCase()
}
