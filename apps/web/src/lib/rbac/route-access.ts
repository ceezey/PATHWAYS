import type { DashboardNavGroup, DashboardNavItem } from '@/constants/navigation'
import type { ReportKind } from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'
import { can, canAny } from './can'
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
}

const normalizePath = (pathname: string) => pathname.split('?')[0] ?? pathname

const hasBeneficiaryPermission = (role: PrototypeRole) =>
  canAny(role, ['beneficiaries.scoped_view', 'beneficiaries.full_view'])

const routeChecks: Array<{
  test: (pathname: string) => boolean
  moduleName: string
  allowed: (role: PrototypeRole) => boolean
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
    allowed: (role) => can(role, 'projects.view'),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/activities/.test(pathname),
    moduleName: 'Activities',
    allowed: (role) => can(role, 'activities.view'),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/evidence/.test(pathname),
    moduleName: 'Evidence review',
    allowed: (role) => can(role, 'evidence.review'),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/indicators/.test(pathname),
    moduleName: 'Target indicators',
    allowed: (role) => can(role, 'indicators.manage'),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/monitor-evaluate/.test(pathname),
    moduleName: 'Monitor & Evaluate',
    allowed: (role) => can(role, 'monitor_evaluate.view'),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/budget/.test(pathname),
    moduleName: 'Budget',
    allowed: (role) =>
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
    allowed: (role) => canAny(role, ['activities.create_edit', 'monitor_evaluate.full']),
  },
  {
    test: (pathname) => /^\/projects\/[^/]+\/transparency/.test(pathname),
    moduleName: 'Transparency publishing',
    allowed: (role) => can(role, 'transparency.publish'),
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
    test: (pathname) =>
      pathname === '/reports/beneficiary-summary' || pathname === '/reports/preview',
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
    moduleName: 'Rule center',
    allowed: (role) => can(role, 'rules.view'),
  },
  {
    test: (pathname) => pathname.startsWith('/settings'),
    moduleName: 'Settings',
    allowed: (role) => can(role, 'settings.view'),
  },
]

export const getRouteAccess = (role: PrototypeRole, pathname: string): RouteAccessResult => {
  const normalizedPath = normalizePath(pathname)
  const route = routeChecks.find((item) => item.test(normalizedPath))

  if (!route) {
    return { allowed: true, moduleName: 'Workspace' }
  }

  const allowed = route.allowed(role)

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
  '/settings': 'settings.view',
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
