import Link from 'next/link'

import { dashboardNavigation } from '@/constants/navigation'

// Short top-bar names for project workspace tabs, keyed by route segment.
const projectTabNames: Record<string, string> = {
  '': 'Overview',
  activities: 'Activities',
  indicators: 'Target Indicators',
  evidence: 'Evidence & Reports',
  'monitor-evaluate': 'Monitoring & Evaluation',
  budget: 'Budget',
  'journey-stages': 'Journey Stages',
}

/** Links the section name to its root and appends the project tab when inside a project. */
export const TopBarBreadcrumb = ({ pathname, label }: { pathname: string; label: string }) => {
  const [section = '', projectId, tab = ''] = pathname.split('/').filter(Boolean)
  const href =
    dashboardNavigation
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((left, right) => right.href.length - left.href.length)[0]?.href ?? pathname
  const tabName = section === 'projects' && projectId ? projectTabNames[tab] : undefined

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
        <li className="truncate">
          <Link
            aria-current={tabName ? undefined : 'page'}
            className="text-foreground hover:text-primary hover:underline"
            href={href}
          >
            {label}
          </Link>
        </li>
        {tabName ? (
          <li aria-current="page" className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <span className="truncate text-muted-foreground">{tabName}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  )
}
