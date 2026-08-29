import type { NavItem } from '@pathways/shared'
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  FolderKanban,
  Home,
  LineChart,
  ListChecks,
  SlidersHorizontal,
  Type,
  UserCog,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface DashboardNavItem extends NavItem {
  icon: LucideIcon
}

export interface DashboardNavGroup {
  id: 'workspace' | 'decision-support' | 'administration'
  label: string
  items: DashboardNavItem[]
}

export const fixedDashboardNavGroupLabels = {
  workspace: 'Workspace',
  decisionSupport: 'Decision Support',
  administration: 'Administration',
} as const

export const fixedDashboardNavItemLabels = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  beneficiaries: 'Beneficiaries',
  collection: 'Collection',
  analytics: 'Analytics',
  alerts: 'Alerts',
  recommendations: 'Recommendations',
  reports: 'Reports',
  alertsRepository: 'Alerts Repository',
  userManagement: 'User Management',
  editLabels: 'Edit Labels',
} as const

export const publicNavigation: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    description: 'Approved public PATHWAYS project summaries.',
  },
  {
    href: '/public/projects',
    label: 'Projects',
    description: 'Browse approved public project pages.',
  },
]

export const createDashboardNavGroups = (): DashboardNavGroup[] => [
  {
    id: 'workspace',
    label: fixedDashboardNavGroupLabels.workspace,
    items: [
      {
        href: '/dashboard',
        label: fixedDashboardNavItemLabels.dashboard,
        description: 'Priorities and progress for the authenticated role.',
        icon: Home,
      },
      {
        href: '/projects',
        label: fixedDashboardNavItemLabels.projects,
        description: 'Project Information Management workspace.',
        icon: FolderKanban,
      },
      {
        href: '/beneficiaries',
        label: fixedDashboardNavItemLabels.beneficiaries,
        description: 'Beneficiary Journey Tracking records.',
        icon: UsersRound,
      },
      {
        href: '/collection',
        label: fixedDashboardNavItemLabels.collection,
        description: 'Metadata-Driven Data Integration workspace.',
        icon: ClipboardList,
      },
    ],
  },
  {
    id: 'decision-support',
    label: fixedDashboardNavGroupLabels.decisionSupport,
    items: [
      {
        href: '/analytics',
        label: fixedDashboardNavItemLabels.analytics,
        description: 'SADDD Analysis and project monitoring.',
        icon: BarChart3,
      },
      {
        href: '/alerts',
        label: fixedDashboardNavItemLabels.alerts,
        description: 'Rule-Based Alerts requiring human review.',
        icon: AlertTriangle,
      },
      {
        href: '/recommendations',
        label: fixedDashboardNavItemLabels.recommendations,
        description: 'Human-reviewed recommendation outcomes.',
        icon: ListChecks,
      },
      {
        href: '/reports',
        label: fixedDashboardNavItemLabels.reports,
        description: 'Human-reviewed reporting outputs.',
        icon: LineChart,
      },
      {
        href: '/alerts/repository',
        label: fixedDashboardNavItemLabels.alertsRepository,
        description: 'Review the rules used to surface alerts for human review.',
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    id: 'administration',
    label: fixedDashboardNavGroupLabels.administration,
    items: [
      {
        href: '/settings/users',
        label: fixedDashboardNavItemLabels.userManagement,
        description: 'Review users, roles, and account states.',
        icon: UserCog,
      },
      {
        href: '/settings/labels',
        label: fixedDashboardNavItemLabels.editLabels,
        description: 'Review approved page headings for future persistence.',
        icon: Type,
      },
    ],
  },
]

export const dashboardNavGroups = createDashboardNavGroups()

export const dashboardNavigation = dashboardNavGroups.flatMap((group) => group.items)

export const getDashboardNavigationLabel = (pathname: string) =>
  createDashboardNavGroups()
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.label ??
  fixedDashboardNavItemLabels.dashboard
