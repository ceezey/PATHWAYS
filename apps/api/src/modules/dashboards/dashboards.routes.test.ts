import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { ForbiddenException, RequestMethod } from '@nestjs/common'
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  RESPONSE_PASSTHROUGH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants'
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum'
import { describe, expect, it } from 'vitest'
import { AppModule } from '../../app.module'
import { AnalyticsController } from '../analytics/analytics.controller'
import { AnalyticsModule } from '../analytics/analytics.module'
import { DashboardsModule } from './dashboards.module'

type Handler = (request: object, ...args: unknown[]) => unknown
type ControllerClass = { new (service: unknown): Record<string, Handler>; prototype: object }

const controllers = (): ControllerClass[] => [
  ...Reflect.getMetadata('controllers', DashboardsModule),
  ...Reflect.getMetadata('controllers', AnalyticsModule),
]
const handlers = (controller: ControllerClass) =>
  Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== 'constructor')

// One sorted line per route: method, full path, permission and Cache-Control header.
function routeTable(): string[] {
  return controllers()
    .flatMap((controller) => {
      const base = Reflect.getMetadata(PATH_METADATA, controller)
      return handlers(controller).map((name) => {
        const handler = (controller.prototype as Record<string, Handler>)[name]
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)]
        const route = Reflect.getMetadata(PATH_METADATA, handler)
        const headers: Array<{ name: string; value: string }> =
          Reflect.getMetadata(HEADERS_METADATA, handler) ?? []
        const cache = headers.find((header) => header.name === 'Cache-Control')?.value
        const path = route === '/' ? `/${base}` : `/${base}/${route}`
        return `${method} ${path} ${Reflect.getMetadata(PERMISSION_KEY, handler)} ${cache}`
      })
    })
    .sort()
}

// One sorted line per handler: the kind, index and data of each parameter decorator.
function argumentTable(): string[] {
  return controllers()
    .flatMap((controller) =>
      handlers(controller).map((name) => {
        const metadata: Record<string, { index: number; data?: string }> =
          Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {}
        const args = Object.entries(metadata)
          .map(([key, { index, data }]) => ({
            index,
            text: `${index}:${RouteParamtypes[Number(key.split(':')[0])]}${data ? `(${data})` : ''}`,
          }))
          .sort((a, b) => a.index - b.index)
          .map(({ text }) => text)
        const passthrough = Reflect.getMetadata(RESPONSE_PASSTHROUGH_METADATA, controller, name)
        return `${controller.name}.${name} ${args.join(' ')}${passthrough ? ' passthrough' : ''}`
      }),
    )
    .sort()
}

describe('dashboards and analytics routes', () => {
  it('registers every route with its permission and no-store header', () => {
    expect(routeTable()).toEqual([
      'GET /analytics/descriptive analytics.descriptive.read private, no-store',
      'GET /analytics/descriptive/export analytics.export private, no-store',
      'GET /analytics/descriptive/export/preview analytics.export private, no-store',
      'GET /analytics/insights/budget analytics.descriptive.read private, no-store',
      'GET /analytics/insights/indicator-trends analytics.descriptive.read private, no-store',
      'GET /analytics/insights/participation analytics.descriptive.read private, no-store',
      'GET /dashboards/action-counts projects.read private, no-store',
      'GET /dashboards/home projects.read private, no-store',
      'GET /dashboards/monitoring monitoring.read private, no-store',
      'GET /dashboards/role-overview projects.read private, no-store',
      'GET /dashboards/saddd analytics.saddd.read private, no-store',
    ])
  })

  it('declares the request, query and response arguments of every handler', () => {
    expect(argumentTable()).toEqual([
      'ActionCountsController.read 0:REQUEST',
      'AnalyticsController.descriptive 0:REQUEST 1:QUERY',
      'AnalyticsController.export 0:REQUEST 1:QUERY 2:RESPONSE passthrough',
      'AnalyticsController.exportPreview 0:REQUEST 1:QUERY',
      'AnalyticsInsightsController.budget 0:REQUEST 1:QUERY',
      'AnalyticsInsightsController.indicatorTrends 0:REQUEST 1:QUERY',
      'AnalyticsInsightsController.participation 0:REQUEST 1:QUERY',
      'DashboardsController.home 0:REQUEST 1:QUERY',
      'DashboardsController.monitoring 0:REQUEST 1:QUERY',
      'DashboardsController.saddd 0:REQUEST 1:QUERY',
      'RoleOverviewController.read 0:REQUEST',
    ])
  })

  it('registers the dashboards and insights modules in the application module', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', AppModule)
    expect(imports).toContain(DashboardsModule)
    expect(imports).toContain(AnalyticsModule)
  })

  it('answers 403 on every route when no application identity is attached', async () => {
    const service = new Proxy({}, { get: () => () => 'service reached' })
    const calls = controllers().flatMap((controller) => {
      const instance = new controller(service)
      return handlers(controller).map(
        (name) => () => Promise.resolve().then(() => instance[name]({ headers: {} })),
      )
    })
    expect(calls).toHaveLength(11)
    for (const call of calls) {
      await expect(call()).rejects.toThrow(ForbiddenException)
      await expect(call()).rejects.toThrow('Application profile is required.')
    }
  })

  it('calls the service method of each handler with the identity first and the other arguments in order', async () => {
    const user = { id: 'identity' }
    const res = { setHeader: () => undefined }
    const called: string[] = []
    for (const controller of controllers()) {
      const service = new Proxy(
        {},
        {
          get:
            (_target, method: string) =>
            (...args: unknown[]) => {
              called.push(
                `${controller.name}.${method}(${args.map((arg) => (arg === user ? 'user' : arg)).join(', ')})`,
              )
              return { contentType: 'text/csv', fileName: 'export.csv', bytes: new Uint8Array() }
            },
        },
      )
      const instance = new controller(service)
      for (const name of handlers(controller)) await instance[name]({ user }, 'query', res)
    }
    expect(called.sort()).toEqual([
      'ActionCountsController.read(user)',
      'AnalyticsController.descriptive(user, query)',
      'AnalyticsController.export(user, query)',
      'AnalyticsController.exportPreview(user, query)',
      'AnalyticsInsightsController.budget(user, query)',
      'AnalyticsInsightsController.indicatorTrends(user, query)',
      'AnalyticsInsightsController.participation(user, query)',
      'DashboardsController.home(user, query)',
      'DashboardsController.monitoring(user, query)',
      'DashboardsController.saddd(user, query)',
      'RoleOverviewController.read(user)',
    ])
  })

  it('sends the export file name as an attachment Content-Disposition with its content type', async () => {
    const headers: Record<string, string> = {}
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
    }
    const service = {
      export: async () => ({
        contentType: 'text/csv; charset=utf-8',
        fileName: 'synthetic-export.csv',
        bytes: new Uint8Array(),
      }),
    }
    const controller = new AnalyticsController(service as never)
    await controller.export({ user: { id: 'identity' } } as never, {}, res)
    expect(headers).toEqual({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="synthetic-export.csv"',
      'X-Content-Type-Options': 'nosniff',
    })
  })
})
