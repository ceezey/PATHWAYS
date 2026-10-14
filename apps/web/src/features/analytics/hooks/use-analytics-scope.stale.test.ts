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
const august = '2026-08-01::2026-08-31'

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
// Lets the then, catch and finally callbacks of a settled promise run inside act.
const settle = (run: () => void) =>
  act(async () => {
    run()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const mount = () => {
  const seen: Array<ReturnType<typeof useAnalyticsScope>> = []
  const view = renderHook(
    (props: typeof grants) => {
      const value = useAnalyticsScope(props)
      seen.push(value)
      return value
    },
    { initialProps: grants },
  )
  return { ...view, seen }
}

describe('useAnalyticsScope stale answers', () => {
  beforeEach(() => {
    api.getProjectsForRole.mockResolvedValue([project('project-a'), project('project-b')])
    api.getActivities.mockResolvedValue([{ id: 'activity-1' }])
    api.getProjectIndicators.mockImplementation((projectId: string) =>
      Promise.resolve([
        indicator(projectId, '2026-09-01', '2026-09-30'),
        indicator(projectId, '2026-08-01', '2026-08-31'),
      ]),
    )
    api.getMonitoringDashboard.mockResolvedValue(monitoring)
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  describe('project list', () => {
    const reload = async () => {
      const first = deferred<unknown[]>()
      const second = deferred<unknown[]>()
      api.getProjectsForRole.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const view = mount()
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(1))
      view.rerender({ ...grants, role: 'Program Manager' as never })
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(2))
      return { view, first, second }
    }

    it('keeps the newer list when an older read answers late', async () => {
      const { view, first, second } = await reload()

      await settle(() => first.resolve([project('project-x')]))

      expect(view.result.current.projects).toEqual([])
      expect(view.result.current.projectId).toBe('')
      expect(view.result.current.projectsLoading).toBe(true)
      await settle(() => second.resolve([project('project-c')]))
      expect(view.result.current.projects.map((row) => row.id)).toEqual(['project-c'])
      expect(view.result.current.projectId).toBe('project-c')
      expect(view.result.current.projectsLoading).toBe(false)
    })

    it('ignores the failure and the end of an older read while the newer one is pending', async () => {
      const { view, first, second } = await reload()

      await settle(() => first.reject(new Error('Stale directory.')))

      expect(view.result.current.projectsError).toBe('')
      expect(view.result.current.projectsLoading).toBe(true)
      await settle(() => second.resolve([project('project-c')]))
      expect(view.result.current.projectsError).toBe('')
      expect(view.result.current.projectsLoading).toBe(false)
      expect(view.result.current.projectId).toBe('project-c')
    })
  })

  describe('project data', () => {
    const switchProject = async () => {
      const first = deferred<unknown[]>()
      const second = deferred<unknown[]>()
      api.getActivities.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const view = mount()
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(1))
      act(() => view.result.current.selectProject('project-b'))
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))
      return { view, first, second }
    }

    it('keeps the newer data and its loading flag when an older read answers late', async () => {
      const { view, first, second } = await switchProject()

      await settle(() => first.resolve([{ id: 'stale' }]))

      expect(view.result.current.activities).toEqual([])
      expect(view.result.current.projectDataLoading).toBe(true)
      await settle(() => second.resolve([{ id: 'fresh' }]))
      expect(view.result.current.activities).toEqual([{ id: 'fresh' }])
      expect(view.result.current.projectDataLoading).toBe(false)
    })

    it('ignores the failure and the end of an older read while the newer one is pending', async () => {
      const { view, first, second } = await switchProject()

      await settle(() => first.reject(new Error('Stale activities.')))

      expect(view.result.current.projectDataError).toBe('')
      expect(view.result.current.projectDataLoading).toBe(true)
      await settle(() => second.resolve([{ id: 'fresh' }]))
      expect(view.result.current.projectDataError).toBe('')
      expect(view.result.current.projectDataLoading).toBe(false)
      expect(view.result.current.activities).toEqual([{ id: 'fresh' }])
    })
  })

  describe('monitoring', () => {
    const changePeriod = async () => {
      const first = deferred<unknown>()
      const second = deferred<unknown>()
      api.getMonitoringDashboard
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      const view = mount()
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      act(() => view.result.current.setPeriod(august))
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
      return { view, first, second }
    }

    it('keeps the newer result and its loading flag when an older read answers late', async () => {
      const { view, first, second } = await changePeriod()

      await settle(() => first.resolve({ indicators: ['stale'] }))

      expect(view.result.current.monitoring).toBeNull()
      expect(view.result.current.monitoringLoading).toBe(true)
      await settle(() => second.resolve(monitoring))
      expect(view.result.current.monitoring).toBe(monitoring)
      expect(view.result.current.monitoringLoading).toBe(false)
    })

    it('ignores the failure and the end of an older read while the newer one is pending', async () => {
      const { view, first, second } = await changePeriod()

      await settle(() => first.reject(new Error('Stale monitoring.')))

      expect(view.result.current.monitoringError).toBe('')
      expect(view.result.current.monitoringLoading).toBe(true)
      await settle(() => second.resolve(monitoring))
      expect(view.result.current.monitoringError).toBe('')
      expect(view.result.current.monitoringLoading).toBe(false)
      expect(view.result.current.monitoring).toBe(monitoring)
    })
  })

  describe('empty scope', () => {
    it('clears the definitions of the old scope, so the returning project sends no stale monitoring read', async () => {
      const view = mount()
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
      expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1)

      api.getProjectsForRole.mockResolvedValue([])
      view.rerender({ ...grants, role: 'Program Manager' as never })
      await waitFor(() => expect(view.result.current.projectId).toBe(''))
      await waitFor(() => expect(view.result.current.monitoring).toBeNull())
      view.seen.length = 0

      api.getProjectsForRole.mockResolvedValue([project('project-a')])
      view.rerender({ ...grants, role: 'Executive Director' as never })
      await waitFor(() => expect(view.result.current.monitoring).toBe(monitoring))
      await settle(() => {})

      const back = view.seen.find((value) => value.projectId === 'project-a')
      expect(back?.reportingPeriods).toEqual([])
      expect(back?.selectedPeriod).toBeUndefined()
      expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2)
    })
  })
})
