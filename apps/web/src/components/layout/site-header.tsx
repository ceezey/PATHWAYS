'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { publicNavigation } from '@/constants/navigation'
import { cn } from '@/lib/utils'

export const SiteHeader = () => {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link
          aria-label="HDO Public Dashboard, PATHWAYS home"
          className="w-fit rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href="/"
        >
          <p className="text-xs font-semibold uppercase text-primary">HDO Public Dashboard</p>
          <p className="mt-0.5 text-lg font-semibold leading-5 text-foreground">PATHWAYS</p>
        </Link>
        <nav
          aria-label="Public navigation"
          className="flex w-full items-center gap-2 border-t border-border pt-3 sm:w-auto sm:gap-3 sm:border-0 sm:pt-0"
        >
          {publicNavigation.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                aria-current={active ? 'page' : undefined}
                key={item.href}
                className={cn(
                  'inline-flex min-h-11 flex-1 items-center justify-center rounded-sm border-b-2 px-3 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-none',
                  active
                    ? 'border-primary bg-primary-subtle text-primary-active'
                    : 'border-transparent text-muted-foreground hover:border-border-strong hover:bg-surface-subtle hover:text-foreground',
                )}
                href={item.href}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
