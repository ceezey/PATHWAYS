import {
  type RoleName,
  type RouteKey,
  type RoutePrincipal,
  hasAtomicPermission,
  hasRoutePermission,
  roleCodeFor,
  rolePermissions,
  routePolicy,
} from '@pathways/shared'
import { getRouteAccess, getVerifiedRouteAccess } from './policy'

export const canonicalFeatures = [
  {
    group: 'Core',
    title: 'Role-Based Access Control and Workspace Management',
    href: '/dashboard',
    route: 'dashboard',
  },
  {
    group: 'Core',
    title: 'Project Profile and Activity Tracking',
    href: '/projects',
    route: 'projects',
  },
  {
    group: 'Core',
    title: 'Centralized Beneficiary Profile',
    href: '/beneficiaries',
    route: 'beneficiaries',
  },
  {
    group: 'Core',
    title: 'Beneficiary Journey Tracking',
    href: '/beneficiaries',
    route: 'beneficiaries',
  },
  {
    group: 'Core',
    title: 'Digital Data Collection and Preparation',
    href: '/collection/forms',
    route: 'forms',
  },
  {
    group: 'Core',
    title: 'Metadata-Driven Data Integration',
    href: '/collection/import',
    route: 'imports',
  },
  {
    group: 'Core',
    title: 'Project Indicator and Monitoring',
    href: '/projects',
    route: 'monitoring',
  },
  {
    group: 'Core',
    title: 'Aggregated Monitoring Dashboard with SADDD Analysis',
    href: '/analytics',
    route: 'analytics',
  },
  {
    group: 'Supporting',
    title: 'Descriptive Analytics and Project Performance Summaries',
    href: '/analytics',
    route: 'analytics',
  },
  {
    group: 'Supporting',
    title: 'Rule-Based Alerts for Underperforming Indicators',
    href: '/alerts/repository',
    route: 'rules',
  },
  {
    group: 'Supporting',
    title: 'Rule-Based Decision Support and Project Recommendation',
    href: '/recommendations',
    route: 'recommendations',
  },
  {
    group: 'Supporting',
    title: 'Reporting and Data Visualization',
    href: '/reports',
    route: 'reports',
  },
  {
    group: 'Supporting',
    title: 'Public Project Tracker for Donors',
    href: '/public/projects',
    route: null,
  },
] as const
export const visibleFeatures = (profile: RoutePrincipal) =>
  canonicalFeatures.filter(
    (feature) =>
      !feature.route ||
      (profile.roles.length === 1 &&
        hasRoutePermission(
          profile.roles[0],
          profile.permissions,
          feature.route,
          routePolicy[feature.route].permissions,
        )),
  )
export function filterDashboardNavGroups<T extends { items: { href: string }[] }>(
  groups: T[],
  role: RoleName | null,
  profile?: RoutePrincipal,
): T[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (profile
            ? getVerifiedRouteAccess(profile, item.href)
            : role
              ? getRouteAccess(role, item.href)
              : { allowed: false }
          ).allowed,
      ),
    }))
    .filter((group) => group.items.length > 0)
}
/** A project workspace tab opens a route, so it carries that route's permissions. */
export interface WorkspaceTabAccess {
  label: string
  path: string
  route?: RouteKey
}
export const filterWorkspaceTabs = <T extends WorkspaceTabAccess>(
  tabs: T[],
  role: RoleName,
  profile?: RoutePrincipal,
  projectId?: string,
) => {
  if (profile)
    return tabs.filter(
      (tab) =>
        !!projectId &&
        getVerifiedRouteAccess(profile, `/projects/${projectId}/${tab.path}`).allowed,
    )
  const key = roleCodeFor(role)
  return tabs.filter(
    (tab) =>
      !!key &&
      (!tab.route ||
        routePolicy[tab.route].permissions.some((permission) =>
          hasAtomicPermission(key, rolePermissions[key], permission),
        )),
  )
}
