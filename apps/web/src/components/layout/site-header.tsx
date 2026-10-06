'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'

import { organizationsHref, publicNavigation, publicOrganizations } from '@/constants/navigation'
import { cn } from '@/lib/utils'

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-navy'

const navItemClass = (active: boolean) =>
  cn(
    'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-sm px-3 text-sm transition-colors',
    focusRing,
    active ? 'font-bold text-white' : 'font-medium text-slate-300 hover:text-white',
  )

// The label links to the organizations page; hovering or focusing it reveals each organization.
const OrganizationsMenu = ({ active }: { active: boolean }) => (
  <div className="group relative">
    <Link
      aria-current={active ? 'page' : undefined}
      className={cn(navItemClass(active), 'gap-1')}
      href={organizationsHref}
    >
      Organizations
      <ChevronDown
        className="h-4 w-4 transition-transform group-has-[:focus-visible]:rotate-180 group-hover:rotate-180"
        aria-hidden="true"
      />
    </Link>
    <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-all duration-200 group-has-[:focus-visible]:visible group-has-[:focus-visible]:opacity-100 group-hover:visible group-hover:opacity-100">
      <ul className="min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-popover">
        {publicOrganizations.map((organization) => (
          <li key={organization.slug}>
            <Link
              className="flex min-h-10 items-center rounded-sm px-3 text-sm transition-colors hover:bg-primary-subtle hover:text-light-blue-foreground focus-visible:bg-primary-subtle focus-visible:outline-none"
              href={`/organizations/${organization.slug}`}
            >
              {organization.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  </div>
)

export const SiteHeader = () => {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link aria-label="PATHWAYS home" className={cn('w-fit rounded-sm', focusRing)} href="/">
          <p className="font-heading text-3xl leading-8 text-white">pathways</p>
        </Link>
        <nav
          aria-label="Public navigation"
          className="-mx-3 flex items-center gap-1 overflow-x-auto sm:mx-0 sm:overflow-visible"
        >
          {publicNavigation.map((item) => (
            <Fragment key={item.href}>
              {item.href === '/about' ? (
                <OrganizationsMenu active={isActive(organizationsHref)} />
              ) : null}
              <Link
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={navItemClass(isActive(item.href))}
                href={item.href}
              >
                {item.label}
              </Link>
            </Fragment>
          ))}
        </nav>
      </div>
    </header>
  )
}
