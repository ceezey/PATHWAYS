import type { NavItem } from '@pathways/shared'
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  DatabaseBackup,
  FolderKanban,
  Home,
  LineChart,
  ScrollText,
  Share2,
  UserCog,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { BACKUP_RECOVERY_UI_ENABLED } from './feature-flags'

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
  reports: 'Reports',
  alertsRepository: 'Alerts Repository',
  userManagement: 'User Management',
  editLabels: 'Edit Labels',
  publicTracker: 'Public Tracker',
  auditLog: 'Audit Log',
  backupRecovery: 'Backup & Recovery',
} as const

export const publicContactHref = '/about#contact'
export const organizationsHref = '/organizations'

// Organizations with a public project page; slugs are public route segments, profiles paraphrase each organization's own site.
export const publicOrganizations = [
  {
    slug: 'plan-international-pilipinas',
    name: 'Plan International Pilipinas',
    location: 'Philippines · nationwide',
    summary:
      "Plan International Pilipinas stands with girls so they can stay safe, stay in school, and lead change, breaking barriers and driving equality in communities across the country. Its work includes youth-led efforts such as young broadcasters championing children's rights on local radio.",
    focus: ["Girls' rights", 'Child protection', 'Education', 'Youth leadership'],
    credentials: 'DSWD-licensed for public solicitation and PCNC-accredited.',
    website: 'https://plan-international.org/philippines/',
  },
] as const

export const publicNavigation: NavItem[] = [
  {
    href: '/',
    label: 'Home',
    description: 'Approved public PATHWAYS project summaries.',
  },
  {
    href: '/about',
    label: 'About Us',
    description: 'The PATHWAYS mission and contact details.',
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
        href: '/reports',
        label: fixedDashboardNavItemLabels.reports,
        description: 'Human-reviewed reporting outputs.',
        icon: LineChart,
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
        description: 'Review users, roles, and account states.',
        icon: UserCog,
      },
      {
        href: '/settings/audit',
        label: fixedDashboardNavItemLabels.auditLog,
        description: 'Inspect significant account actions and system events.',
        icon: ScrollText,
      },
      ...(BACKUP_RECOVERY_UI_ENABLED
        ? [
            {
              href: '/settings/backups',
              label: fixedDashboardNavItemLabels.backupRecovery,
              description: 'Review backup readiness and recovery safeguards.',
              icon: DatabaseBackup,
            },
          ]
        : []),
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
