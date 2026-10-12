import 'reflect-metadata'

import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'

import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { ActivitiesModule } from './activities.module'

type Route = { verb: string; path: string; permission: string }

// Every route the module registers, in Nest registration order: controller order, then method order.
function registeredRoutes(): Route[] {
  const controllers: (new (...args: never[]) => object)[] =
    Reflect.getMetadata('controllers', ActivitiesModule) ?? []
  return controllers.flatMap((controller) => {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string
    return Object.getOwnPropertyNames(controller.prototype).flatMap((name) => {
      if (name === 'constructor') return []
      const handler = (controller.prototype as Record<string, object>)[name]
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined
      if (method === undefined) return []
      // Nest stores the bare decorator as "/", so slashes at either end are not part of the segment.
      const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '').replace(
        /^\/+|\/+$/g,
        '',
      )
      return [
        {
          verb: RequestMethod[method],
          path: path ? `${prefix}/${path}` : prefix,
          permission: Reflect.getMetadata(PERMISSION_KEY, handler) as string,
        },
      ]
    })
  })
}

const activities = 'projects/:projectId/activities'
const expected: Route[] = [
  { verb: 'GET', path: activities, permission: 'activities.read' },
  { verb: 'GET', path: `${activities}/proof-upload-limits`, permission: 'activities.proof.submit' },
  { verb: 'GET', path: `${activities}/context`, permission: 'activities.context.read' },
  { verb: 'GET', path: `${activities}/assignable-officers`, permission: 'activities.read' },
  { verb: 'POST', path: activities, permission: 'activities.create' },
  { verb: 'GET', path: `${activities}/:activityId`, permission: 'activities.read' },
  { verb: 'PATCH', path: `${activities}/:activityId`, permission: 'activities.update' },
  { verb: 'POST', path: `${activities}/:activityId/transition`, permission: 'activities.read' },
  {
    verb: 'POST',
    path: `${activities}/:activityId/progress`,
    permission: 'activities.progress.update',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/overdue-explanations`,
    permission: 'monitoring.review',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/updates/reservations`,
    permission: 'activities.proof.submit',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/updates/:updateId/files/:evidenceId/finalize`,
    permission: 'activities.proof.submit',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/updates/:updateId/review`,
    permission: 'evidence.review',
  },
  {
    verb: 'GET',
    path: `${activities}/:activityId/updates/:updateId/inspection-context`,
    permission: 'evidence.review',
  },
  {
    verb: 'GET',
    path: `${activities}/:activityId/updates/:updateId/proof/:evidenceId/inspection`,
    permission: 'evidence.review',
  },
  { verb: 'GET', path: `${activities}/:activityId/proof/:evidenceId`, permission: 'evidence.read' },
  { verb: 'GET', path: 'projects/:projectId/milestones', permission: 'activities.read' },
  { verb: 'POST', path: 'projects/:projectId/milestones', permission: 'milestones.manage' },
  {
    verb: 'PATCH',
    path: 'projects/:projectId/milestones/:milestoneId',
    permission: 'milestones.manage',
  },
  { verb: 'GET', path: 'projects/:projectId/evidence', permission: 'evidence.read' },
]

const key = (route: Route) => `${route.verb} ${route.path}`

describe('activities module routes', () => {
  it('registers the same routes with the same permissions after any controller split', () => {
    const actual = registeredRoutes()
    expect(actual.map(key).sort()).toEqual(expected.map(key).sort())
    for (const route of expected)
      expect(actual.find((item) => key(item) === key(route))?.permission).toBe(route.permission)
  })

  it('registers each fixed GET segment before the :activityId detail route', () => {
    const order = registeredRoutes().map(key)
    const detail = order.indexOf(`GET ${activities}/:activityId`)
    for (const segment of ['proof-upload-limits', 'context', 'assignable-officers'])
      expect(order.indexOf(`GET ${activities}/${segment}`)).toBeLessThan(detail)
  })

  it('has no retired multipart update route', () => {
    expect(registeredRoutes().map((route) => route.path)).not.toContain(
      `${activities}/:activityId/updates`,
    )
  })
})
