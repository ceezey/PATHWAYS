import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type PublicAnalyticsResponse,
  type PublicView,
  businessCalendarDate,
  publicAnalyticsResponse,
  publicParticipationResponse,
  publicSadddResponse,
  publicView,
  storedProjectStatuses,
} from '@pathways/shared'
import { z } from 'zod'

import { UUID_PATTERN } from '../../common/authz/application-identity'
import { PrismaService } from '../../prisma/prisma.service'
import { prismaDiagnosticCode } from '../../prisma/transaction-diagnostic'
import {
  buildTimelineAnalytics,
  timelineAggregateSchema,
} from '../analytics/timeline-analytics.helpers'
import { releasedNulls, toIndicatorResponse } from '../indicators/indicators.mapper'
import { applySavedPins, resolvePlaces } from '../project-map/ph-places'
import { placeReach, resolveTowns, townReachSchema } from '../project-map/project-map.service'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timelineData = z.object({
  project: z.object({
    status: z.enum(storedProjectStatuses),
    startDate: date.nullable(),
    endDate: date.nullable(),
  }),
  aggregate: timelineAggregateSchema,
  lastCompletion: date.nullable(),
})
// Pins are copied into the snapshot at submission; a snapshot from before pins existed has none.
const snapshotPin = z.object({
  name: z.string(),
  province: z.string(),
  longitude: z.number(),
  latitude: z.number(),
})
const mapData = z.object({
  area: z.string().nullable(),
  towns: townReachSchema,
  pins: z.array(snapshotPin).default([]),
})
const kpiData = z.array(z.record(z.string(), z.unknown())).max(100)
// The public page has no organization; the timeline builder only needs a well-formed scope.
const NO_ORGANIZATION = '00000000-0000-0000-0000-000000000000'
const logger = new Logger('PublicAnalyticsService')

@Injectable()
export class PublicAnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Computes one chart now from the live snapshot; every call re-reads it, so a withdrawal ends it at once. */
  async read(projectId: string, view: string): Promise<PublicAnalyticsResponse> {
    const wanted = publicView.safeParse(view)
    if (!wanted.success || !UUID_PATTERN.test(projectId))
      throw new NotFoundException('View unavailable.')
    let data: unknown
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ data: unknown }>>`
        SELECT pathways.p87_public_view(${projectId}::uuid,${wanted.data}) AS data`
      data = row?.data
    } catch (error) {
      throw this.unavailable('PATHWAYS_PUBLIC_ANALYTICS_QUERY_FAILED', wanted.data, error)
    }
    if (data === null || data === undefined) throw new NotFoundException('View unavailable.')
    try {
      return publicAnalyticsResponse.parse({
        view: wanted.data,
        ...this.shape(projectId, wanted.data, data),
      })
    } catch (error) {
      throw this.unavailable('PATHWAYS_PUBLIC_ANALYTICS_SHAPE_FAILED', wanted.data, error)
    }
  }

  // Fixed diagnostics only: the Prisma code or error name and the view, never the message, SQL, project id or keys.
  private unavailable(event: string, view: PublicView, error: unknown) {
    try {
      logger.warn({
        event,
        view,
        error: prismaDiagnosticCode(error) || (error instanceof Error ? error.name : 'UNKNOWN'),
      })
    } catch {
      // Diagnostics must not change the fixed 503.
    }
    return new ServiceUnavailableException('Public analytics are temporarily unavailable.')
  }

  private shape(projectId: string, view: PublicView, data: unknown) {
    switch (view) {
      case 'kpi':
        return {
          indicators: kpiData
            .parse(data)
            .map((item) => toIndicatorResponse({ ...item, ...releasedNulls }, 'Unavailable.')),
        }
      case 'saddd':
        return publicSadddResponse.parse(data)
      case 'participation':
        return publicParticipationResponse.parse(data)
      case 'timeline': {
        const { project, aggregate, lastCompletion } = timelineData.parse(data)
        return buildTimelineAnalytics({
          projectId,
          organizationId: NO_ORGANIZATION,
          generatedAt: new Date().toISOString(),
          reportingDate: businessCalendarDate(new Date(), 'Asia/Manila'),
          project: { ...project, archived: false },
          aggregate,
          lastCompletedOn: lastCompletion,
        })
      }
      case 'map': {
        const { area, towns, pins } = mapData.parse(data)
        const resolved = resolveTowns(towns)
        return {
          places: applySavedPins(resolvePlaces(area), pins).map((place) => ({
            ...place,
            reach: placeReach(place, resolved),
          })),
        }
      }
    }
  }
}
