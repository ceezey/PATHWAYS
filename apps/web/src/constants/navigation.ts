import type { NavItem } from '@pathways/shared'

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

export const dashboardNavigation: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    description: 'Monitoring shell and quick stats.',
  },
  {
    href: '/participants',
    label: 'Participant Registry',
    description: 'Placeholder registry workspace.',
  },
  {
    href: '/imports',
    label: 'Imports',
    description: 'Import and validation staging area.',
  },
  {
    href: '/reports',
    label: 'Reports',
    description: 'Report generation and export staging.',
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Environment, storage, and access setup notes.',
  },
]
