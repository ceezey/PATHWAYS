'use client'

import { Menu, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { APP_NAME } from '@pathways/shared'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { dashboardNavigation } from '@/constants/navigation'
import { useSession } from '@/hooks/use-session'
import { cn } from '@/lib/utils'

const DashboardLinks = ({ onNavigate }: { onNavigate?: () => void }) => {
  const pathname = usePathname()

  return (
    <nav className="space-y-1">
      {dashboardNavigation.map((item) => {
        const active = pathname === item.href

        return (
          <Link
            key={item.href}
            className={cn(
              'block rounded-xl border px-4 py-3 transition-colors',
              active
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground',
            )}
            href={item.href}
            onClick={onNavigate}
          >
            <p className="font-medium">{item.label}</p>
            <p className="mt-1 text-xs leading-5">{item.description}</p>
          </Link>
        )
      })}
    </nav>
  )
}

export const DashboardShell = ({ children }: { children: React.ReactNode }) => {
  const { email, isBypassed, signOut } = useSession()

  return (
    <div className="min-h-screen bg-muted/30 lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-r border-border/70 bg-background lg:flex lg:flex-col">
        <div className="space-y-2 border-b border-border/70 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
            Dashboard
          </p>
          <h1 className="text-xl font-semibold text-foreground">{APP_NAME}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Metadata-driven program monitoring workspace scaffold.
          </p>
        </div>
        <div className="flex-1 px-4 py-6">
          <DashboardLinks />
        </div>
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/85 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button className="lg:hidden" size="icon" variant="outline">
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:max-w-none">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
                      Workspace
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">{APP_NAME}</h2>
                  </div>
                  <DashboardLinks />
                </div>
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-sm font-medium text-foreground">Program Monitoring Shell</p>
              <p className="text-xs text-muted-foreground">
                {isBypassed
                  ? 'Development auth bypass active.'
                  : 'Supabase-backed auth session placeholder.'}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2" variant="outline">
                <ShieldCheck className="h-4 w-4" />
                {email ?? 'Access state'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Session</DropdownMenuLabel>
              <DropdownMenuItem disabled>{email ?? 'No signed-in user'}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>
                Reset local session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 px-4 py-8 md:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
