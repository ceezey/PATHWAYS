'use client'

import { useEffect, useMemo, useState } from 'react'

import type { useCurrentRole } from '@/hooks/use-current-role'
import { activitiesClient } from '@/lib/api/activities'
import { dashboardsClient } from '@/lib/api/dashboards'
import { indicatorsClient } from '@/lib/api/indicators'
import { projectsClient } from '@/lib/api/projects'
import type { ActivitySummary, ProjectSummary } from '@/types/pathways'
import type { IndicatorResponse, MonitoringDashboard } from '@pathways/shared'

import { deriveAnalyticsReportingPeriods } from '../analytics-reporting-periods.utils'

export const useAnalyticsScope = ({
  canReadActivities,
  canReadIndicatorDefinitions,
  canReadIndicatorValues,
  canReadIndicators,
  role,
}: {
  canReadActivities: boolean
  canReadIndicatorDefinitions: boolean
  canReadIndicatorValues: boolean
  canReadIndicators: boolean
  role: ReturnType<typeof useCurrentRole>['role']
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [period, setPeriod] = useState('')
  const [indicatorDefinitions, setIndicatorDefinitions] = useState<IndicatorResponse[]>([])
  const [monitoring, setMonitoring] = useState<MonitoringDashboard | null>(null)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectDataLoading, setProjectDataLoading] = useState(false)
  const [monitoringLoading, setMonitoringLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [projectDataError, setProjectDataError] = useState('')
  const [monitoringError, setMonitoringError] = useState('')
  const [projectsLoadAttempt, setProjectsLoadAttempt] = useState(0)
  const [projectDataLoadAttempt, setProjectDataLoadAttempt] = useState(0)
  const [monitoringLoadAttempt, setMonitoringLoadAttempt] = useState(0)

  const selectedProject = projects.find((row) => row.id === projectId)
  const reportingPeriods = useMemo(
    () =>
      deriveAnalyticsReportingPeriods(
        selectedProject,
        indicatorDefinitions.filter((indicator) => indicator.projectId === projectId),
      ),
    [indicatorDefinitions, projectId, selectedProject],
  )
  // Monitoring, KPI and descriptive panels always use every readable reporting period.
  const selectedPeriod =
    reportingPeriods.find((candidate) => candidate.value === period) ?? reportingPeriods[0]

  useEffect(() => {
    if (!role) {
      setProjectsLoading(false)
      return
    }
    void projectsLoadAttempt
    let active = true
    setProjectsLoading(true)
    setProjectsError('')
    projectsClient
      .getProjectsForRole(role)
      .then((records) => {
        if (!active) return
        setProjects(records)
        setProjectId((current) =>
          records.some((row) => row.id === current) ? current : (records[0]?.id ?? ''),
        )
      })
      .catch((caught: unknown) => {
        if (active)
          setProjectsError(
            caught instanceof Error ? caught.message : 'Projects could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setProjectsLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectsLoadAttempt, role])

  useEffect(() => {
    if (!projectId || !selectedProject) {
      setProjectDataLoading(false)
      setActivities([])
      setIndicatorDefinitions([])
      return
    }
    void projectDataLoadAttempt
    let active = true
    setProjectDataLoading(true)
    setProjectDataError('')
    setActivities([])
    setIndicatorDefinitions([])
    setPeriod('')
    setMonitoring(null)
    setMonitoringError('')
    Promise.all([
      canReadActivities
        ? activitiesClient.getActivities(projectId)
        : Promise.resolve<ActivitySummary[]>([]),
      canReadIndicatorDefinitions
        ? indicatorsClient.getProjectIndicators(projectId)
        : canReadIndicatorValues
          ? indicatorsClient.getProjectIndicatorValues(projectId)
          : Promise.resolve<IndicatorResponse[]>([]),
    ])
      .then(([nextActivities, nextIndicators]) => {
        if (!active) return
        setActivities(nextActivities)
        setIndicatorDefinitions(nextIndicators)
      })
      .catch((caught: unknown) => {
        if (active)
          setProjectDataError(
            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setProjectDataLoading(false)
      })
    return () => {
      active = false
    }
  }, [
    canReadActivities,
    canReadIndicatorDefinitions,
    canReadIndicatorValues,
    projectDataLoadAttempt,
    projectId,
    selectedProject,
  ])

  useEffect(() => {
    setPeriod((current) =>
      reportingPeriods.some((candidate) => candidate.value === current)
        ? current
        : (reportingPeriods[0]?.value ?? ''),
    )
  }, [reportingPeriods])

  useEffect(() => {
    if (!projectId || !selectedPeriod || !canReadIndicators) {
      setMonitoringLoading(false)
      setMonitoring(null)
      setMonitoringError('')
      return
    }
    void monitoringLoadAttempt
    let active = true
    setMonitoringLoading(true)
    setMonitoring(null)
    setMonitoringError('')
    dashboardsClient
      .getMonitoringDashboard({
        projectId,
        periodStart: selectedPeriod.start,
        periodEnd: selectedPeriod.end,
      })
      .then((nextMonitoring) => {
        if (active) setMonitoring(nextMonitoring)
      })
      .catch((caught: unknown) => {
        if (active)
          setMonitoringError(
            caught instanceof Error ? caught.message : 'Analytics data could not be loaded.',
          )
      })
      .finally(() => {
        if (active) setMonitoringLoading(false)
      })
    return () => {
      active = false
    }
  }, [canReadIndicators, monitoringLoadAttempt, projectId, selectedPeriod])

  const retryLoad = () => {
    if (projectsError) setProjectsLoadAttempt((value) => value + 1)
    else if (projectDataError) setProjectDataLoadAttempt((value) => value + 1)
    else setMonitoringLoadAttempt((value) => value + 1)
  }
  const retryMapData = () =>
    projectDataError
      ? setProjectDataLoadAttempt((value) => value + 1)
      : setMonitoringLoadAttempt((value) => value + 1)

  const selectProject = (nextProjectId: string) => {
    setProjectId(nextProjectId)
    setPeriod('')
    setIndicatorDefinitions([])
    setMonitoring(null)
    setActivities([])
    setProjectDataLoading(true)
    setMonitoringLoading(false)
    setProjectDataError('')
    setMonitoringError('')
  }

  return {
    activities,
    monitoring,
    monitoringError,
    monitoringLoading,
    period,
    projectDataError,
    projectDataLoading,
    projectId,
    projects,
    projectsError,
    projectsLoading,
    reportingPeriods,
    retryLoad,
    retryMapData,
    selectProject,
    selectedPeriod,
    selectedProject,
    setPeriod,
  }
}
