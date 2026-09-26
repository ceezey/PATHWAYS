/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectDetail } from '@/types/pathways'

import { ProjectWorkspaceHeader } from './project-workspace-header'

const projectId = '72000000-0000-4000-8000-000000000004'
const access = vi.hoisted(() => ({
  role: 'System Administrator',
  profile: {
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['projects.read', 'indicators.read', 'budgets.read'],
    assignedProjectIds: [] as string[],
  },
}))

vi.mock('next/navigation', () => ({ usePathname: () => `/projects/${projectId}` }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({
    labels: {
      projectActivities: 'Activities',
      projectIndicators: 'Indicators',
      projectEvidence: 'Evidence',
      projectMonitorEvaluate: 'Monitor & Evaluate',
      projectBudget: 'Budget',
      projectJourneyStages: 'Journey Stages',
    },
  }),
}))

const project = {
  id: projectId,
  title: 'Project Alpha',
  description: 'Project description',
  status: 'Active',
  health: 'On Track',
  metricsAvailable: true,
} as ProjectDetail

describe('project workspace tab access', () => {
  beforeEach(() => {
    access.role = 'System Administrator'
    access.profile.roles = ['SYSTEM_ADMINISTRATOR']
    access.profile.permissions = ['projects.read', 'indicators.read', 'budgets.read']
    access.profile.assignedProjectIds = []
  })

  afterEach(() => cleanup())

  it('shows the Indicators tab to a canonical monitoring reader', () => {
    render(<ProjectWorkspaceHeader project={project} />)

    expect(screen.getByRole('tab', { name: 'Indicators' })).toBeTruthy()
  })

  it('denies Budget and Indicators for expense-only Project Officer access', () => {
    access.role = 'Project Officer'
    access.profile.roles = ['PROJECT_OFFICER']
    access.profile.permissions = ['projects.read', 'expenses.submit']
    access.profile.assignedProjectIds = [projectId]

    render(<ProjectWorkspaceHeader project={project} />)

    expect(screen.queryByRole('tab', { name: 'Budget' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Indicators' })).toBeNull()
  })
})
