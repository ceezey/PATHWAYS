import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { RulesHumanModule } from './rules-human.module'
import { RulesSourceOperationsModule } from './rules-source-operations.module'

type Handler = (request: object, ...args: string[]) => unknown
type ControllerClass = { new (service: unknown): Record<string, Handler>; prototype: object }

const controllers = (): ControllerClass[] => [
  ...Reflect.getMetadata('controllers', RulesHumanModule),
  ...Reflect.getMetadata('controllers', RulesSourceOperationsModule),
]
const handlers = (controller: ControllerClass) =>
  Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== 'constructor')

// One line per route in registration order: method, full path, permission and Cache-Control header.
function routeTable(): string[] {
  return controllers().flatMap((controller) => {
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
}

describe('rules routes', () => {
  it('registers every route with its permission and no-store header in a stable order', () => {
    expect(routeTable()).toEqual([
      'GET /rules rules.read private, no-store',
      'POST /rules rules.create private, no-store',
      'POST /rules/dry-run rules.read private, no-store',
      'GET /rules/:id rules.read private, no-store',
      'POST /rules/:id/drafts rules.update private, no-store',
      'POST /rules/:id/activate rules.activate private, no-store',
      'POST /rules/:id/archive rules.update private, no-store',
      'GET /alerts alerts.read private, no-store',
      'GET /alerts/escalated alerts.read private, no-store',
      'GET /alerts/:id alerts.read private, no-store',
      'GET /alerts/:id/history alerts.read private, no-store',
      'POST /alerts/:id/review alerts.review private, no-store',
      'POST /alerts/:id/disposition alerts.outcome.record private, no-store',
      'POST /alerts/:id/outcome-preview alerts.outcome.record private, no-store',
      'POST /alerts/:id/outcomes alerts.outcome.record private, no-store',
      'GET /recommendations recommendations.read private, no-store',
      'GET /recommendations/:id recommendations.read private, no-store',
      'POST /recommendations/:id/review recommendations.review private, no-store',
      'POST /recommendations/:id/outcome-preview recommendations.outcome.record private, no-store',
      'POST /recommendations/:id/outcomes recommendations.outcome.record private, no-store',
      'GET /notifications alerts.read private, no-store',
      'POST /notifications/:id/read alerts.read private, no-store',
      'POST /projects/:projectId/source-operations/abandon undefined private, no-store',
    ])
  })

  it('answers 403 on every route when no application identity is attached', () => {
    const service = new Proxy({}, { get: () => () => 'service reached' })
    const calls = controllers().flatMap((controller) => {
      const instance = new controller(service)
      return handlers(controller).map((name) => () => instance[name]({ headers: {} }))
    })
    expect(calls).toHaveLength(23)
    for (const call of calls) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Application profile is required.')
    }
  })

  it('calls the service method of each handler with the identity first and the other arguments in order', () => {
    const user = { id: 'identity' }
    const calls: string[] = []
    const service = new Proxy(
      {},
      {
        get:
          (_target, method) =>
          (...args: unknown[]) =>
            calls.push(
              `${String(method)}(${args.map((arg) => (arg === user ? 'user' : arg)).join(', ')})`,
            ),
      },
    )
    for (const controller of controllers()) {
      const instance = new controller(service)
      for (const name of handlers(controller)) instance[name]({ user }, 'a', 'b')
    }
    expect(calls).toEqual([
      'listRules(user, a)',
      'createRule(user, a)',
      'dryRun(user, a)',
      'getRule(user, a)',
      'draftRule(user, a, b)',
      'activateRule(user, a, b)',
      'archiveRule(user, a, b)',
      'listAlerts(user, a)',
      'listEscalatedAlerts(user, a)',
      'getAlert(user, a)',
      'alertHistory(user, a, b)',
      'reviewAlert(user, a, b)',
      'dispositionAlert(user, a, b)',
      'previewAlert(user, a, b)',
      'confirmAlert(user, a, b)',
      'listRecommendations(user, a)',
      'getRecommendation(user, a)',
      'reviewRecommendation(user, a, b)',
      'previewRecommendation(user, a, b)',
      'confirmRecommendation(user, a, b)',
      'listNotifications(user, a)',
      'readNotification(user, a, b)',
      'abandon(user, a, b)',
    ])
  })
})
