/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const projectId = '79000000-0000-4000-8000-000000000003'
const indicator = {
  id: '79000000-0000-4000-8000-000000000010',
  projectId,
  code: 'P06-02',
  name: 'Synthetic indicator',
  description: null,
  unitLabel: 'participants',
  dataSource: 'Validated attendance',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  baseline: '0',
  target: '20',
  current: { state: 'AVAILABLE', value: '15', reason: null },
  progress: { state: 'AVAILABLE', value: '75', reason: null },
  binding: null,
  measurementId: null,
  measuredAt: null,
  measurementSource: null,
  revision: 1,
  status: 'ACTIVE',
}
const monitoring = vi.hoisted(() => ({ reload: vi.fn(), replaceData: vi.fn() }))
const api = vi.hoisted(() => ({
  getProjectIndicators: vi.fn(),
  updateProjectIndicator: vi.fn(),
}))
const tickets = vi.hoisted(() => ({ replay: false, finishAcknowledgement: vi.fn() }))
const recovery = vi.hoisted(() => ({
  onRecovered: null as null | (() => Promise<() => void>),
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'ready',
    profile: {
      id: 'synthetic-subject',
      organizationId: 'synthetic-org',
      userId: 'synthetic-user',
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: ['monitoring.read', 'indicators.update'],
      assignedProjectIds: [projectId],
    },
  }),
}))
vi.mock('@/hooks/use-source-mutation-context', () => ({
  useSourceMutationContext: () => ({ isCurrent: () => true }),
}))
vi.mock('@/features/analytics/use-monitoring-read', () => ({
  useMonitoringRead: () => ({
    data: [indicator],
    loading: false,
    error: null,
    reload: monitoring.reload,
    replaceData: monitoring.replaceData,
    authorityKey: 'synthetic',
  }),
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => ({ data: undefined, isError: false }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class extends Error {},
  pathwaysClient: api,
}))
vi.mock('@/lib/services/source-mutation', () => ({
  isSourceReplay: () => tickets.replay,
  sourceMutationTickets: { finishAcknowledgement: tickets.finishAcknowledgement },
}))
vi.mock('./source-mutation-recovery', () => ({
  SourceMutationRecovery: ({ onRecovered }: { onRecovered: () => Promise<() => void> }) => {
    recovery.onRecovered = onRecovered
    return null
  },
}))

import { ProjectIndicatorsWorkspace } from './project-indicators-workspace'

const saveLabels = () => {
  render(<ProjectIndicatorsWorkspace projectId={projectId} />)
  const form = screen.getByRole('button', { name: 'Save labels' }).closest('form')
  if (!form) throw new Error('Missing label form')
  fireEvent.submit(form)
}

describe('indicator saves reload persisted state exactly once', () => {
  beforeEach(() => {
    tickets.replay = false
    api.getProjectIndicators.mockResolvedValue([indicator])
    api.updateProjectIndicator.mockResolvedValue({ ...indicator, revision: 2 })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reloads once after a fresh save', async () => {
    saveLabels()
    await waitFor(() => expect(monitoring.reload).toHaveBeenCalledOnce())
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
    expect(monitoring.replaceData).not.toHaveBeenCalled()
  })

  it('uses the confirming authorized read after a replayed save instead of reading again', async () => {
    tickets.replay = true
    api.updateProjectIndicator.mockResolvedValue({ requestId: 'replayed' })
    saveLabels()
    await waitFor(() => expect(monitoring.replaceData).toHaveBeenCalledWith([indicator]))
    expect(api.getProjectIndicators).toHaveBeenCalledOnce()
    expect(tickets.finishAcknowledgement).toHaveBeenCalledOnce()
    expect(monitoring.reload).not.toHaveBeenCalled()
  })

  it('shows the recovered outcome from its confirming read without a second reload', async () => {
    render(<ProjectIndicatorsWorkspace projectId={projectId} />)
    if (!recovery.onRecovered) throw new Error('Missing recovery hook')
    const apply = await recovery.onRecovered()
    apply()
    expect(api.getProjectIndicators).toHaveBeenCalledOnce()
    expect(monitoring.replaceData).toHaveBeenCalledWith([indicator])
    expect(monitoring.reload).not.toHaveBeenCalled()
  })
})
