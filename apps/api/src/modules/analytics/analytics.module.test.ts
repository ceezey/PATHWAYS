import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import { DashboardsService } from '../dashboards/dashboards.service'
import { AnalyticsInsightsService } from './analytics-insights.service'
import { AnalyticsModule } from './analytics.module'
import { AnalyticsService } from './analytics.service'

describe('AnalyticsModule', () => {
  it('resolves both services from its own imports, leaving only the global PrismaService to the mocker', async () => {
    const mocked: string[] = []
    const moduleRef = await Test.createTestingModule({ imports: [AnalyticsModule] })
      .useMocker((token) => {
        mocked.push(typeof token === 'function' ? token.name : String(token))
        return {}
      })
      .compile()
    expect(moduleRef.get(AnalyticsService)).toBeInstanceOf(AnalyticsService)
    expect(moduleRef.get(AnalyticsInsightsService)).toBeInstanceOf(AnalyticsInsightsService)
    expect(moduleRef.get(DashboardsService, { strict: false })).toBeInstanceOf(DashboardsService)
    expect([...new Set(mocked)]).toEqual(['PrismaService'])
  })
})
