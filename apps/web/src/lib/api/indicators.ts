import {
  type CreateIndicatorFromLibraryRequest,
  type CreateIndicatorLibraryEntryRequest,
  type CreateIndicatorRequest,
  type IndicatorLibraryEntryResponse,
  type IndicatorResponse,
  type RecordIndicatorMeasurementRequest,
  type UpdateIndicatorRequest,
  indicatorLibraryEntryResponse,
  indicatorListResponse,
  indicatorResponse,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
import {
  type SourceMutationContext,
  type SourceMutationResult,
  sourceMutationTickets,
} from '@/lib/services/source-mutation'
import type { Indicator } from '@/types/pathways'

export const indicatorsClient = {
  async getProjectIndicators(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<IndicatorResponse[]> {
    return indicatorListResponse.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicators`, { signal }),
    )
  },

  // KPI values for monitoring.read and reports.indicator.read holders without indicators.read; definitions stay closed.
  async getProjectIndicatorValues(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<IndicatorResponse[]> {
    return indicatorListResponse.parse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/indicator-values`, {
        signal,
      }),
    )
  },

  async createProjectIndicator(
    projectId: string,
    input: Omit<CreateIndicatorRequest, 'clientMutationId'>,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators`,
      'POST',
      input,
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async createProjectIndicatorFromLibrary(
    projectId: string,
    input: Omit<CreateIndicatorFromLibraryRequest, 'clientMutationId'>,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/from-library`,
      'POST',
      input,
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async updateProjectIndicator(
    projectId: string,
    indicatorId: string,
    input: Omit<UpdateIndicatorRequest, 'clientMutationId'>,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}`,
      'PATCH',
      input,
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async recordIndicatorMeasurement(
    projectId: string,
    indicatorId: string,
    input: RecordIndicatorMeasurementRequest,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    if (!context?.isCurrent())
      throw new PathwaysClientError('Current measurement ownership is required.', 'unauthorized')
    const { clientMeasurementId, ...body } = input
    const path = `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/measurements`
    return sourceMutationTickets.execute(
      context,
      `POST:${path}`,
      body,
      (captured) =>
        requestFoundation(
          path,
          { method: 'POST', body: JSON.stringify(captured) },
          context.isCurrent,
        ),
      (value) => indicatorResponse.parse(value),
      { requestId: clientMeasurementId, keyField: 'clientMeasurementId', allowLegacy: true },
    )
  },

  async archiveProjectIndicator(
    projectId: string,
    indicatorId: string,
    expectedRevision: number,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<IndicatorResponse>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(projectId)}/indicators/${encodeURIComponent(indicatorId)}/archive`,
      'POST',
      { expectedRevision },
      context,
      (value) => indicatorResponse.parse(value),
    )
  },

  async getIndicators(projectId?: string, signal?: AbortSignal): Promise<Indicator[]> {
    if (!projectId) {
      throw new PathwaysClientError('Project scope is required.', 'invalid')
    }

    return (await indicatorsClient.getProjectIndicators(projectId, signal)).map(
      ({ id, projectId: scope, code, name }) => ({
        id,
        projectId: scope,
        code,
        label: name,
      }),
    )
  },
}

export const indicatorLibraryClient = {
  async list(): Promise<IndicatorLibraryEntryResponse[]> {
    const rows = await requestFoundation('/indicator-library')
    return indicatorLibraryEntryResponse.array().parse(rows)
  },
  async create(input: CreateIndicatorLibraryEntryRequest): Promise<IndicatorLibraryEntryResponse> {
    return indicatorLibraryEntryResponse.parse(
      await requestFoundation('/indicator-library', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },
  async archive(entryId: string): Promise<void> {
    await requestFoundation(`/indicator-library/${encodeURIComponent(entryId)}/archive`, {
      method: 'POST',
    })
  },
}
