'use client'

import { Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { Sidebar } from '@/components/layout/sidebar'
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
import { cn } from '@/lib/utils'
import { getPathwaysRoleDisplayName } from '@/types/pathways-role'

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const [compact, setCompact] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { email, signOut } = useSession()
  const { role } = useCurrentRole()
  const roleLabel = role ? getPathwaysRoleDisplayName(role) : 'Role unavailable'
  const workspaceLabel = getDashboardNavigationLabel(pathname)

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[auto_1fr]">
      <div className="hidden lg:block">
        <Sidebar compact={compact} />
      </div>
      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button className="lg:hidden" size="icon" variant="outline">
                    <Menu className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Open navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[292px] border-0 p-0 sm:max-w-none">
                  <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Open a section of the PATHWAYS workspace.
                  </SheetDescription>
                  <Sidebar onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <Button
                aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
                className="hidden lg:inline-flex"
                onClick={() => setCompact((value) => !value)}
                size="icon"
                title={compact ? 'Expand sidebar' : 'Collapse sidebar'}
                variant="outline"
              >
                {compact ? (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{workspaceLabel}</p>
                <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="max-w-[48vw] gap-2 truncate" variant="outline">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{email ?? 'Access state'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Session</DropdownMenuLabel>
                <DropdownMenuItem disabled>{email ?? 'No signed-in user'}</DropdownMenuItem>
                <DropdownMenuItem disabled>{roleLabel}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          className={cn(
            'flex-1 px-4 py-6 md:px-6 md:py-8',
            'bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--workspace))_100%)]',
          )}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
