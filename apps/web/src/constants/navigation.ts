import type { NavItem } from '@pathways/shared'
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  DatabaseBackup,
  FolderKanban,
  Home,
  LibraryBig,
  LineChart,
  ListChecks,
  ScrollText,
  Share2,
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
  indicatorLibrary: 'Indicator Library',
  publicTracker: 'Public Tracker',
  auditLog: 'Audit Log',
  backupRecovery: 'Backup & Recovery',
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
        description: 'Priorities and progress for the selected role.',
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
      {
        href: '/indicators',
        label: fixedDashboardNavItemLabels.indicatorLibrary,
        description: 'Review reusable indicator definitions and project assignments.',
        icon: LibraryBig,
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
      {
        href: '/transparency',
        label: fixedDashboardNavItemLabels.publicTracker,
        description: 'Review projects prepared for public visibility.',
        icon: Share2,
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
        description: 'Review prototype users, roles, and account states.',
        icon: UserCog,
      },
      {
        href: '/settings/audit',
        label: fixedDashboardNavItemLabels.auditLog,
        description: 'Inspect significant prototype actions and system events.',
        icon: ScrollText,
      },
      {
        href: '/settings/backups',
        label: fixedDashboardNavItemLabels.backupRecovery,
        description: 'Review backup readiness and recovery safeguards.',
        icon: DatabaseBackup,
      },
      {
        href: '/settings/labels',
        label: fixedDashboardNavItemLabels.editLabels,
        description: 'Edit approved browser-local page headings.',
        icon: Type,
      },
    ],
  },
]

export const dashboardNavGroups = createDashboardNavGroups()

export const dashboardNavigation = dashboardNavGroups.flatMap((group) => group.items)

export const getDashboardNavigationLabel = (pathname: string) =>
  pathname === '/settings/profile'
    ? 'My Profile'
    : (createDashboardNavGroups()
        .flatMap((group) => group.items)
        .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
        .sort((left, right) => right.href.length - left.href.length)[0]?.label ??
      fixedDashboardNavItemLabels.dashboard)
