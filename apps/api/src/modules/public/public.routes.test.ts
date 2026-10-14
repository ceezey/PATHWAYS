import 'reflect-metadata'

import { ForbiddenException, RequestMethod } from '@nestjs/common'
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants'
import { describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator'
import { PublicModule } from './public.module'

type Handler = (...args: unknown[]) => unknown
type ControllerClass = { new (service: unknown): Record<string, Handler>; prototype: object }

const controllers = (): ControllerClass[] => Reflect.getMetadata('controllers', PublicModule)
const metadata = (controller: ControllerClass, name: string, key: string) =>
  Reflect.getMetadata(key, (controller.prototype as Record<string, Handler>)[name])
// The route handlers: methods with an HTTP method, which leaves out the private profile check.
const handlers = (controller: ControllerClass) =>
  Object.getOwnPropertyNames(controller.prototype).filter(
    (name) => name !== 'constructor' && metadata(controller, name, METHOD_METADATA) !== undefined,
  )

// One sorted line per route: method, full path, access rule and Cache-Control header.
function routeTable(): string[] {
  return controllers()
    .flatMap((controller) =>
      handlers(controller).map((name) => {
        const base = Reflect.getMetadata(PATH_METADATA, controller)
        const route = metadata(controller, name, PATH_METADATA)
        const method = RequestMethod[metadata(controller, name, METHOD_METADATA)]
        const headers: Array<{ name: string; value: string }> =
          metadata(controller, name, HEADERS_METADATA) ?? []
        const cache = headers.find((header) => header.name === 'Cache-Control')?.value
        const access = metadata(controller, name, IS_PUBLIC_KEY)
          ? 'public'
          : metadata(controller, name, PERMISSION_KEY)
        return `${method} /${route === '/' ? base : `${base}/${route}`} ${access} ${cache}`
      }),
    )
    .sort()
}

describe('public and publication routes', () => {
  it('registers every route with its method, path, access rule and cache header', () => {
    expect(routeTable()).toEqual([
      'GET /projects/:projectId/publication public.preview private, no-store',
      'GET /public/projects public no-store',
      'GET /public/projects/:projectId public no-store',
      'POST /projects/:projectId/publication/approve public.approve private, no-store',
      'POST /projects/:projectId/publication/publish public.publish private, no-store',
      'POST /projects/:projectId/publication/submit public.preview private, no-store',
      'POST /projects/:projectId/publication/withdraw public.publish private, no-store',
    ])
  })

  it('answers 403 on every publication route when the request carries no profile', () => {
    const publication = controllers().find(
      (controller) => controller.name === 'PublicationController',
    )
    const instance = new (publication as ControllerClass)({})
    for (const name of handlers(publication as ControllerClass)) {
      expect(() => instance[name]({ headers: {} }, 'p1', {})).toThrow(ForbiddenException)
      expect(() => instance[name]({ headers: {} }, 'p1', {})).toThrow(
        'Application profile required.',
      )
    }
  })

  it('passes the profile, the project, the operation and the body to the service', () => {
    const publication = controllers().find(
      (controller) => controller.name === 'PublicationController',
    )
    const service = { get: vi.fn(), transition: vi.fn() }
    const instance = new (publication as ControllerClass)(service)
    const user = { id: 'profile' }
    const body = { expectedRevision: 0 }
    const operations = {
      submit: 'SUBMIT',
      approve: 'APPROVE',
      publish: 'PUBLISH',
      withdraw: 'WITHDRAW',
    }
    instance.get({ headers: {}, user }, 'p1')
    expect(service.get).toHaveBeenCalledWith(user, 'p1')
    for (const [name, operation] of Object.entries(operations)) {
      instance[name]({ headers: {}, user }, 'p1', body)
      expect(service.transition).toHaveBeenLastCalledWith(user, 'p1', operation, body)
    }
  })

  it('declares the four publication bodies as the third argument with no pipe', () => {
    const publication = controllers().find(
      (controller) => controller.name === 'PublicationController',
    ) as ControllerClass
    for (const name of ['submit', 'approve', 'publish', 'withdraw']) {
      const args: Record<string, { index: number; pipes: unknown[] }> = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        publication,
        name,
      )
      const body = Object.entries(args).find(([key]) => key.startsWith('3:'))?.[1]
      expect(body?.index).toBe(2)
      expect(body?.pipes).toEqual([])
    }
  })

  it('reads the public list with its default page and one project by id', () => {
    const projects = controllers().find(
      (controller) => controller.name === 'PublicProjectsController',
    )
    const service = { published: vi.fn() }
    const instance = new (projects as ControllerClass)(service)
    instance.list(undefined, undefined)
    expect(service.published).toHaveBeenLastCalledWith(undefined, 0, 50)
    instance.list('20', '10')
    expect(service.published).toHaveBeenLastCalledWith(undefined, 20, 10)
    instance.get('p1')
    expect(service.published).toHaveBeenLastCalledWith('p1')
  })
})
