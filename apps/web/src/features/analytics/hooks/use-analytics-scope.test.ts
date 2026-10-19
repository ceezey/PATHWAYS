/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAnalyticsScope } from './use-analytics-scope'

const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getMonitoringDashboard: vi.fn(),
  getProjectIndicators: vi.fn(),
  getProjectIndicatorValues: vi.fn(),
  getProjectsForRole: vi.fn(),
}))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))

const project = (id: string) => ({ id, title: `Project ${id}`, startDate: null, endDate: null })
const indicator = (projectId: string, periodStart: string, periodEnd: string) => ({
  id: `${projectId}-${periodStart}`,
  projectId,
  status: 'ACTIVE',
  periodStart,
  periodEnd,
})
const grants = {
  canReadActivities: true,
  canReadIndicatorDefinitions: true,
  canReadIndicatorValues: true,
  canReadIndicators: true,
  role: 'Project Manager' as const,
}
const monitoring = { indicators: [] }
const september = { start: '2026-09-01', end: '2026-09-30' }
const august = '2026-08-01::2026-08-31'

// Renders the hook and keeps every value it returned, so a state change can be read before its effects run.
const mount = (initial: Partial<typeof grants> = {}) => {
  const seen: Array<ReturnType<typeof useAnalyticsScope>> = []
  const view = renderHook(
    (props: typeof grants) => {
      const value = useAnalyticsScope(props)
      seen.push(value)
      return value
    },
    { initialProps: { ...grants, ...initial } },
  )
  return { ...view, seen }
}
const loaded = async (view: ReturnType<typeof mount>) => {
  await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
}

describe('useAnalyticsScope', () => {
  beforeEach(() => {
    api.getProjectsForRole.mockResolvedValue([project('project-a'), project('project-b')])
    api.getActivities.mockResolvedValue([{ id: 'activity-1' }])
    api.getProjectIndicators.mockImplementation((projectId: string) =>
      Promise.resolve([
        indicator(projectId, '2026-09-01', '2026-09-30'),
        indicator(projectId, '2026-08-01', '2026-08-31'),
      ]),
    )
    api.getProjectIndicatorValues.mockResolvedValue([
      indicator('project-a', '2026-07-01', '2026-07-31'),
    ])
    api.getMonitoringDashboard.mockResolvedValue(monitoring)
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  describe('project list', () => {
    it('reads the projects of the role and selects the first one', async () => {
      const view = mount()
      expect(view.seen[0].projectsLoading).toBe(true)

      await waitFor(() => expect(view.result.current.projectId).toBe('project-a'))
      expect(api.getProjectsForRole).toHaveBeenCalledWith('Project Manager')
      expect(view.result.current.projects.map((row) => row.id)).toEqual(['project-a', 'project-b'])
      expect(view.result.current.selectedProject?.id).toBe('project-a')
      expect(view.result.current.projectsLoading).toBe(false)
    })

    it('stops loading and reads nothing without a role', () => {
      const view = mount({ role: null as never })

      expect(api.getProjectsForRole).not.toHaveBeenCalled()
      expect(view.result.current.projectsLoading).toBe(false)
      expect(view.result.current.projectId).toBe('')
    })

    it('keeps a selected project that the reloaded list still holds', async () => {
      const view = mount()
      await loaded(view)
      act(() => view.result.current.selectProject('project-b'))
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))

      view.rerender({ ...grants, role: 'Program Manager' as never })

      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Program Manager'))
      await waitFor(() => expect(view.result.current.projectsLoading).toBe(false))
      expect(view.result.current.projectId).toBe('project-b')
    })

    it('falls back to the first project when the reloaded list lacks the selection', async () => {
      const view = mount()
      await loaded(view)
      act(() => view.result.current.selectProject('project-b'))
      api.getProjectsForRole.mockResolvedValue([project('project-c')])

      view.rerender({ ...grants, role: 'Program Manager' as never })

      await waitFor(() => expect(view.result.current.projectId).toBe('project-c'))
    })

    it('selects nothing when the list is empty', async () => {
      api.getProjectsForRole.mockResolvedValue([])
      const view = mount()

      await waitFor(() => expect(view.result.current.projectsLoading).toBe(false))
      expect(view.result.current.projectId).toBe('')
      expect(view.result.current.selectedProject).toBeUndefined()
      expect(api.getActivities).not.toHaveBeenCalled()
    })

    it('clears the activities when the reloaded list is empty', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.activities).toHaveLength(1)
      api.getProjectsForRole.mockResolvedValue([])

      view.rerender({ ...grants, role: 'Program Manager' as never })

      await waitFor(() => expect(view.result.current.projectId).toBe(''))
      expect(view.result.current.activities).toEqual([])
      expect(view.result.current.reportingPeriods).toEqual([])
      expect(view.result.current.projectDataLoading).toBe(false)
    })

    it('keeps the failure message, or names a failure without one, and clears it on a new read', async () => {
      api.getProjectsForRole.mockRejectedValueOnce(new Error('Directory down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectsError).toBe('Directory down.'))
      expect(view.result.current.projectsLoading).toBe(false)

      api.getProjectsForRole.mockRejectedValueOnce('down')
      act(() => view.result.current.retryLoad())
      await waitFor(() =>
        expect(view.result.current.projectsError).toBe('Projects could not be loaded.'),
      )

      act(() => view.result.current.retryLoad())
      await waitFor(() => expect(view.result.current.projectsError).toBe(''))
    })
  })

  describe('project data', () => {
    it('reads the activities and the indicator definitions of the selected project', async () => {
      const view = mount()
      await loaded(view)

      expect(api.getActivities).toHaveBeenCalledWith('project-a')
      expect(api.getProjectIndicators).toHaveBeenCalledWith('project-a')
      expect(api.getProjectIndicatorValues).not.toHaveBeenCalled()
      expect(view.result.current.activities).toEqual([{ id: 'activity-1' }])
      expect(view.result.current.reportingPeriods.map((row) => row.start)).toEqual([
        '2026-09-01',
        '2026-08-01',
      ])
    })

    it('reads no activities without the activities grant', async () => {
      const view = mount({ canReadActivities: false })
      await loaded(view)

      expect(api.getActivities).not.toHaveBeenCalled()
      expect(view.result.current.activities).toEqual([])
    })

    it('reads the released values when the role cannot read the definitions', async () => {
      const view = mount({ canReadIndicatorDefinitions: false })
      await loaded(view)

      expect(api.getProjectIndicators).not.toHaveBeenCalled()
      expect(api.getProjectIndicatorValues).toHaveBeenCalledWith('project-a')
      expect(view.result.current.reportingPeriods.map((row) => row.start)).toEqual(['2026-07-01'])
    })

    it('reads no indicators when the role holds neither grant', async () => {
      const view = mount({ canReadIndicatorDefinitions: false, canReadIndicatorValues: false })
      await waitFor(() => expect(view.result.current.projectDataLoading).toBe(false))
      await waitFor(() => expect(view.result.current.projectId).toBe('project-a'))

      expect(api.getProjectIndicators).not.toHaveBeenCalled()
      expect(api.getProjectIndicatorValues).not.toHaveBeenCalled()
      expect(view.result.current.reportingPeriods).toEqual([])
    })

    it('keeps the failure message, or names a failure without one, and reads again on Retry', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectDataError).toBe('Activities down.'))
      expect(view.result.current.projectDataLoading).toBe(false)

      api.getActivities.mockRejectedValueOnce('down')
      act(() => view.result.current.retryLoad())
      await waitFor(() =>
        expect(view.result.current.projectDataError).toBe('Analytics data could not be loaded.'),
      )

      act(() => view.result.current.retryLoad())
      await waitFor(() => expect(view.result.current.projectDataError).toBe(''))
      expect(api.getActivities).toHaveBeenCalledTimes(3)
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
    })

    it('drops a result that arrives after the project changed', async () => {
      let resolveLate: (rows: unknown[]) => void = () => {}
      const late = new Promise<unknown[]>((resolve) => {
        resolveLate = resolve
      })
      api.getActivities.mockReturnValueOnce(late)
      const view = mount()
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(1))

      act(() => view.result.current.selectProject('project-b'))
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))
      await act(async () => resolveLate([{ id: 'stale' }]))

      expect(view.result.current.activities).not.toEqual([{ id: 'stale' }])
    })
  })

  describe('grants', () => {
    it('reads no activities after the activities grant is lost and does not read them again', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.activities).toHaveLength(1)

      view.rerender({ ...grants, canReadActivities: false })

      await waitFor(() => expect(view.result.current.activities).toEqual([]))
      expect(api.getActivities).toHaveBeenCalledTimes(1)
    })

    it('clears the activities and the periods while a changed grant reads the project data again', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.reportingPeriods).toHaveLength(2)
      api.getActivities.mockReturnValue(new Promise(() => {}))
      api.getProjectIndicators.mockReturnValue(new Promise(() => {}))

      view.rerender({ ...grants, canReadIndicatorValues: false })

      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(2))
      expect(view.result.current.activities).toEqual([])
      expect(view.result.current.reportingPeriods).toEqual([])
      expect(view.result.current.projectDataLoading).toBe(true)
    })
  })

  describe('reporting period', () => {
    it('selects the first period and keeps one the person chose', async () => {
      const view = mount()
      await loaded(view)
      expect(view.result.current.selectedPeriod).toMatchObject(september)

      act(() => view.result.current.setPeriod(august))
      expect(view.result.current.period).toBe(august)
      expect(view.result.current.selectedPeriod).toMatchObject({ start: '2026-08-01' })
    })

    it('sets the period to the first one when the periods load, and to nothing without periods', async () => {
      const view = mount()
      await waitFor(() => expect(view.result.current.period).toBe('2026-09-01::2026-09-30'))

      api.getProjectIndicators.mockResolvedValue([])
      act(() => view.result.current.selectProject('project-b'))
      await waitFor(() => expect(view.result.current.projectDataLoading).toBe(false))
      expect(view.result.current.period).toBe('')
      expect(view.result.current.selectedPeriod).toBeUndefined()
    })
  })

  describe('monitoring', () => {
    it('reads the monitoring of the selected period', async () => {
      const view = mount()
      await loaded(view)

      expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      })
      expect(view.result.current.monitoringLoading).toBe(false)
    })

    it('reads nothing without the monitoring grant', async () => {
      const view = mount({ canReadIndicators: false })
      await waitFor(() => expect(view.result.current.reportingPeriods).toHaveLength(2))

      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
      expect(view.result.current.monitoring).toBeNull()
      expect(view.result.current.monitoringLoading).toBe(false)
    })

    it('clears the result and the failure when the monitoring grant is lost', async () => {
      const view = mount()
      await loaded(view)

      view.rerender({ ...grants, canReadIndicators: false })

      await waitFor(() => expect(view.result.current.monitoring).toBeNull())
      cleanup()
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      const failed = mount()
      await waitFor(() => expect(failed.result.current.monitoringError).toBe('Monitoring down.'))

      failed.rerender({ ...grants, canReadIndicators: false })

      await waitFor(() => expect(failed.result.current.monitoringError).toBe(''))
    })

    it('reads again for another period and clears the previous result while it loads', async () => {
      const view = mount()
      await loaded(view)
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))

      act(() => view.result.current.setPeriod(august))

      await waitFor(() => expect(view.result.current.monitoringLoading).toBe(true))
      expect(view.result.current.monitoring).toBeNull()
      expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
        projectId: 'project-a',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      })
    })

    it('keeps the failure message, or names a failure without one, and reads again on Retry', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.monitoringError).toBe('Monitoring down.'))
      expect(view.result.current.monitoringLoading).toBe(false)

      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      act(() => view.result.current.retryLoad())
      await waitFor(() =>
        expect(view.result.current.monitoringError).toBe('Analytics data could not be loaded.'),
      )

      act(() => view.result.current.retryLoad())
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
      expect(view.result.current.monitoringError).toBe('')
      expect(api.getActivities).toHaveBeenCalledTimes(1)
    })
  })

  describe('retry', () => {
    it('reads the map data again from the failed read: project data first, then monitoring', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectDataError).toBe('Activities down.'))

      act(() => view.result.current.retryMapData())
      await loaded(view)
      expect(api.getActivities).toHaveBeenCalledTimes(2)
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)

      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      act(() => view.result.current.setPeriod(august))
      await waitFor(() => expect(view.result.current.monitoringError).toBe('Monitoring down.'))
      act(() => view.result.current.retryMapData())
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
      expect(api.getActivities).toHaveBeenCalledTimes(2)
    })
  })

  describe('selectProject', () => {
    it('switches the project and clears everything the previous project held, before any effect runs', async () => {
      const view = mount()
      await loaded(view)
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      const [first] = view.seen
      expect(first.projectId).toBe('project-b')
      expect(first.period).toBe('')
      expect(first.activities).toEqual([])
      expect(first.reportingPeriods).toEqual([])
      expect(first.monitoring).toBeNull()
      expect(first.projectDataLoading).toBe(true)
      expect(first.monitoringLoading).toBe(false)
      expect(first.projectDataError).toBe('')
      expect(first.monitoringError).toBe('')
    })

    it('clears the loading flag of a monitoring read that is still pending', async () => {
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      const view = mount()
      await waitFor(() => expect(view.result.current.monitoringLoading).toBe(true))
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      expect(view.seen[0].monitoringLoading).toBe(false)
    })

    it('clears the failures of the previous project', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.projectDataError).toBe('Activities down.'))
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      expect(view.seen[0].projectDataError).toBe('')
      await loaded(view)
      expect(view.result.current.projectId).toBe('project-b')
    })

    it('clears a monitoring failure of the previous project', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring down.'))
      const view = mount()
      await waitFor(() => expect(view.result.current.monitoringError).toBe('Monitoring down.'))
      view.seen.length = 0

      act(() => view.result.current.selectProject('project-b'))

      expect(view.seen[0].monitoringError).toBe('')
    })
  })
})
