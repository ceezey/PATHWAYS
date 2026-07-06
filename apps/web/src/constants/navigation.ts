import type { NavItem } from '@pathways/shared'
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  FolderKanban,
  Home,
  LineChart,
  ListChecks,
  Settings,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface DashboardNavItem extends NavItem {
  icon: LucideIcon
}

export interface DashboardNavGroup {
  label: string
  items: DashboardNavItem[]
}

export const publicNavigation: NavItem[] = [
  {
    href: '/',
    label: 'Overview',
    description: 'Project summary and setup status.',
  },
  {
    href: '/login',
    label: 'Login',
    description: 'Staff sign-in entry point.',
  },
]

export const dashboardNavGroups: DashboardNavGroup[] = [
  {
    label: 'Workspace',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        description: 'Portfolio and role-aware workspace overview.',
        icon: Home,
      },
      {
        href: '/projects',
        label: 'Projects',
        description: 'Project Information Management.',
        icon: FolderKanban,
      },
      {
        href: '/beneficiaries',
        label: 'Beneficiaries',
        description: 'Beneficiary Journey Tracking.',
        icon: UsersRound,
      },
      {
        href: '/collection',
        label: 'Collection',
        description: 'Metadata-Driven Data Integration.',
        icon: ClipboardList,
      },
    ],
  },
  {
    label: 'Decision Support',
    items: [
      {
        href: '/analytics',
        label: 'Analytics',
        description: 'SADDD Analysis and project insights.',
        icon: BarChart3,
      },
      {
        href: '/alerts',
        label: 'Alerts',
        description: 'Rule-based alerts for human review.',
        icon: AlertTriangle,
      },
      {
        href: '/recommendations',
        label: 'Recommendations',
        description: 'Predefined rule recommendations and outcomes.',
        icon: ListChecks,
      },
      {
        href: '/reports',
        label: 'Reports',
        description: 'Human-reviewed reporting outputs.',
        icon: LineChart,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        href: '/settings',
        label: 'Settings',
        description: 'Prototype setup and configuration notes.',
        icon: Settings,
      },
    ],
  },
]

export const dashboardNavigation = dashboardNavGroups.flatMap((group) => group.items)
