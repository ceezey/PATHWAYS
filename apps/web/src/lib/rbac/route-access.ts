import type { DashboardNavGroup, DashboardNavItem } from '@/constants/navigation'
import type { ReportKind } from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'
import { can, canAny } from './can'
import { canAccessProjectForRole } from './data-scope'
import type { PermissionCode } from './permissions'

export interface RouteAccessResult {
  allowed: boolean
  moduleName: string
  requiresBeneficiaryStepUp?: boolean
}

export interface WorkspaceTabAccess {
  label: string
  path: string
  permission?: PermissionCode
  anyPermissions?: PermissionCode[]
}

export const reportKindPermissions: Record<ReportKind, PermissionCode> = {
  'project-summary': 'reports.project_summary.view',
  'indicator-summary': 'reports.indicator_summary.view',
  'beneficiary-summary': 'reports.beneficiary_summary.view',
  'survey-results': 'reports.view',
}

const reportKindModuleNames: Record<ReportKind, string> = {
  'project-summary': 'Project Summary',
  'indicator-summary': 'Indicator Summary',
  'beneficiary-summary': 'Beneficiary Summary',
  'survey-results': 'Survey/Form Results',
}

const normalizePath = (pathname: string) => pathname.split('?')[0] ?? pathname

const getPreviewReportKind = (pathname: string): ReportKind => {
  const query = pathname.split('?')[1] ?? ''
  const requestedKind = new URLSearchParams(query).get('kind')

  return requestedKind && requestedKind in reportKindPermissions
    ? (requestedKind as ReportKind)
    : 'beneficiary-summary'
}

const hasBeneficiaryPermission = (role: PrototypeRole) =>
  canAny(role, ['beneficiaries.scoped_view', 'beneficiaries.full_view'])

const getProjectIdFromPath = (pathname: string) =>
  /^\/projects\/([^/]+)/.exec(pathname)?.[1] ?? null

const canAccessProjectPath = (role: PrototypeRole, pathname: string) => {
  const projectId = getProjectIdFromPath(pathname)
  return projectId ? canAccessProjectForRole(role, projectId) : true
}

const routeChecks: Array<{
  test: (pathname: string) => boolean
  moduleName: string
  allowed: (role: PrototypeRole, pathname: string) => boolean
  requiresBeneficiaryStepUp?: (role: PrototypeRole) => boolean
}> = [
  {
    test: (pathname) => pathname === '/dashboard',
    moduleName: 'Dashboard',
    allowed: () => true,
  },
  {
    test: (pathname) => pathname === '/unauthorized',
    moduleName: 'Unauthorized',
    allowed: () => true,
  },
  {
    test: (pathname) => pathname === '/projects/new',
    moduleName: 'Project setup',
    allowed: (role) => can(role, 'projects.create'),
  },
  {
    test: (pathname) => pathname === '/projects' || /^\/projects\/[^/]+$/.test(pathname),
    moduleName: 'Projects',
    allowed: (role, pathname) => can(role, 'projects.view') && canAccessProjectPath(role, pathname),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/activities/.test(pathname),
    moduleName: 'Activities',
    allowed: (role, pathname) =>
      can(role, 'activities.view') && canAccessProjectPath(role, pathname),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/evidence/.test(pathname),
    moduleName: 'Evidence review',
    allowed: (role, pathname) =>
      can(role, 'evidence.review') && canAccessProjectPath(role, pathname),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/indicators/.test(pathname),
    moduleName: 'Target indicators',
    allowed: (role, pathname) =>
      can(role, 'indicators.manage') && canAccessProjectPath(role, pathname),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/monitor-evaluate/.test(pathname),
    moduleName: 'Monitor & Evaluate',
    allowed: (role, pathname) =>
      can(role, 'monitor_evaluate.view') && canAccessProjectPath(role, pathname),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/budget/.test(pathname),
    moduleName: 'Budget',
    allowed: (role, pathname) =>
      canAccessProjectPath(role, pathname) &&
      canAny(role, [
        'budget.expense.log',
        'budget.expense.view',
        'budget.full',
        'budget.portfolio_view',
      ]),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/journey-stages/.test(pathname),
    moduleName: 'Journey stages',
    allowed: (role, pathname) =>
      canAccessProjectPath(role, pathname) &&
      canAny(role, ['activities.create_edit', 'monitor_evaluate.full']),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/transparency/.test(pathname),
    moduleName: 'Public dashboard preview',
    allowed: (role, pathname) =>
      canAccessProjectPath(role, pathname) &&
      canAny(role, ['transparency.preview', 'transparency.publish']),
  },
  {
    test: (pathname) => pathname.startsWith('/beneficiaries'),
    moduleName: 'Beneficiaries',
    allowed: hasBeneficiaryPermission,
    requiresBeneficiaryStepUp: (role) =>
      role !== 'System Administrator' && hasBeneficiaryPermission(role),
  },
  {
    test: (pathname) => pathname.startsWith('/collection'),
    moduleName: 'Collection',
    allowed: (role) => can(role, 'collection.view'),
  },
  {
    test: (pathname) => pathname.startsWith('/analytics'),
    moduleName: 'Analytics',
    allowed: (role) => can(role, 'analytics.view'),
  },
  {
    test: (pathname) => pathname === '/alerts/repository',
    moduleName: 'Alerts Repository',
    allowed: (role) => can(role, 'rules.view'),
  },
  {
    test: (pathname) => pathname.startsWith('/alerts'),
    moduleName: 'Alerts',
    allowed: (role) => can(role, 'alerts.outcome.log'),
  },
  {
    test: (pathname) => pathname.startsWith('/recommendations'),
    moduleName: 'Recommendations',
    allowed: (role) => can(role, 'alerts.outcome.log'),
  },
  {
    test: (pathname) => pathname === '/reports/project-summary',
    moduleName: 'Project Summary',
    allowed: (role) => can(role, reportKindPermissions['project-summary']),
  },
  {
    test: (pathname) => pathname === '/reports/indicator-summary',
    moduleName: 'Indicator Summary',
    allowed: (role) => can(role, reportKindPermissions['indicator-summary']),
  },
  {
    test: (pathname) => pathname === '/reports/survey-results',
    moduleName: 'Survey/Form Results',
    allowed: (role) => can(role, reportKindPermissions['survey-results']),
  },
  {
    test: (pathname) => pathname === '/reports/beneficiary-summary',
    moduleName: 'Beneficiary Summary',
    allowed: (role) => can(role, reportKindPermissions['beneficiary-summary']),
  },
  {
    test: (pathname) => pathname.startsWith('/reports'),
    moduleName: 'Reports',
    allowed: (role) => can(role, 'reports.view'),
  },
  {
    test: (pathname) => pathname === '/settings/rules',
    moduleName: 'Alerts Repository',
    allowed: (role) => can(role, 'rules.view'),
  },
  {
    test: (pathname) => pathname === '/settings/users',
    moduleName: 'User Management',
    allowed: (role) => can(role, 'settings.users.manage'),
  },
  {
    test: (pathname) => pathname === '/settings/labels',
    moduleName: 'Edit Labels',
    allowed: (role) => can(role, 'settings.view'),
  },
  {
    test: (pathname) => pathname.startsWith('/settings'),
    moduleName: 'Settings',
    allowed: (role) => can(role, 'settings.view'),
  },
]

export const getRouteAccess = (role: PrototypeRole, pathname: string): RouteAccessResult => {
  const normalizedPath = normalizePath(pathname)

  if (normalizedPath === '/reports/preview') {
    const reportKind = getPreviewReportKind(pathname)
    const allowed = can(role, reportKindPermissions[reportKind])

    return {
      allowed,
      moduleName: `${reportKindModuleNames[reportKind]} preview`,
      requiresBeneficiaryStepUp:
        allowed && reportKind === 'beneficiary-summary' ? role !== 'System Administrator' : false,
    }
  }

  const route = routeChecks.find((item) => item.test(normalizedPath))

  if (!route) {
    return { allowed: true, moduleName: 'Workspace' }
  }

  const allowed = route.allowed(role, normalizedPath)

  return {
    allowed,
    moduleName: route.moduleName,
    requiresBeneficiaryStepUp: allowed ? route.requiresBeneficiaryStepUp?.(role) : false,
  }
}

const navPermissions: Record<string, PermissionCode | PermissionCode[] | undefined> = {
  '/dashboard': undefined,
  '/projects': 'projects.view',
  '/beneficiaries': ['beneficiaries.scoped_view', 'beneficiaries.full_view'],
  '/collection': 'collection.view',
  '/analytics': 'analytics.view',
  '/alerts': 'alerts.outcome.log',
  '/recommendations': 'alerts.outcome.log',
  '/reports': 'reports.view',
  '/alerts/repository': 'rules.view',
  '/settings/users': 'settings.users.manage',
  '/settings/labels': 'settings.view',
}

export const filterDashboardNavGroups = (
  groups: DashboardNavGroup[],
  role: PrototypeRole,
): DashboardNavGroup[] =>
  groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canViewNavItem(item, role)),
    }))
    .filter((group) => group.items.length > 0)

const canViewNavItem = (item: DashboardNavItem, role: PrototypeRole) => {
  const permission = navPermissions[item.href]

  if (!permission) {
    return true
  }

  return Array.isArray(permission) ? canAny(role, permission) : can(role, permission)
}

export const filterWorkspaceTabs = <Tab extends WorkspaceTabAccess>(
  tabs: Tab[],
  role: PrototypeRole,
) =>
  tabs.filter((tab) => {
    if (tab.anyPermissions) {
      return canAny(role, tab.anyPermissions)
    }

    if (tab.permission) {
      return can(role, tab.permission)
    }

    return true
  })
