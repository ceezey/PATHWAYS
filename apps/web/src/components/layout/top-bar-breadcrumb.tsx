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
  // The indicator library is reached from a project's Target Indicators tab.
  const library = section === 'indicators' && projectId === 'library'
  const trail = library
    ? ['Target Indicators', 'Indicator Library']
    : section === 'projects' && projectId && projectTabNames[tab] !== undefined
      ? [projectTabNames[tab]]
      : []

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
        <li className="truncate">
          <Link
            aria-current={trail.length ? undefined : 'page'}
            className="text-foreground hover:text-primary hover:underline"
            href={library ? '/projects' : href}
          >
            {library ? 'Projects' : label}
          </Link>
        </li>
        {trail.map((name, index) => (
          <li
            aria-current={index === trail.length - 1 ? 'page' : undefined}
            className="flex min-w-0 items-center gap-1.5"
            key={name}
          >
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <span className="truncate text-muted-foreground">{name}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
