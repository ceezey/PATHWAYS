import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
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
import {
  buildTimelineAnalytics,
  timelineAggregateSchema,
} from '../analytics/timeline-analytics.helpers'
import { releasedNulls, toIndicatorResponse } from '../indicators/indicators.mapper'
import { resolvePlaces } from '../project-map/ph-places'
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
const mapData = z.object({ area: z.string().nullable(), towns: townReachSchema })
const kpiData = z.array(z.record(z.string(), z.unknown())).max(100)
// The public page has no organization; the timeline builder only needs a well-formed scope.
const NO_ORGANIZATION = '00000000-0000-0000-0000-000000000000'

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
    } catch {
      throw this.unavailable()
    }
    if (data === null || data === undefined) throw new NotFoundException('View unavailable.')
    try {
      return publicAnalyticsResponse.parse({
        view: wanted.data,
        ...this.shape(projectId, wanted.data, data),
      })
    } catch {
      throw this.unavailable()
    }
  }

  private unavailable() {
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
        const { area, towns } = mapData.parse(data)
        const resolved = resolveTowns(towns)
        return {
          places: resolvePlaces(area).map((place) => ({
            ...place,
            reach: placeReach(place, resolved),
          })),
        }
      }
    }
  }
}
