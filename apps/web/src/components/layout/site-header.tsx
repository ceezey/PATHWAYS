'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { publicNavigation } from '@/constants/navigation'
import { cn } from '@/lib/utils'

export const SiteHeader = () => {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <Link className="space-y-1" href="/">
          <p className="text-xs font-semibold uppercase text-teal-700">HDO Public Dashboard</p>
          <p className="text-lg font-semibold text-slate-950">PATHWAYS</p>
        </Link>
        <nav
          aria-label="Public navigation"
          className="flex w-full items-center gap-2 border-t border-slate-200 pt-3 sm:w-auto sm:gap-3 sm:border-0 sm:pt-0"
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
                  'flex-1 rounded-md px-3 py-2 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 sm:flex-none',
                  active
                    ? 'bg-teal-50 font-medium text-teal-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
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
