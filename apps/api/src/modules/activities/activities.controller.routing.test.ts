import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import type { INestApplication, Type } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ActivitiesModule } from './activities.module'

const projectId = '10000000-0000-4000-8000-000000000001'
const activityId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '50000000-0000-4000-8000-000000000005', aal: 'aal2' }

// A stand-in service whose every method answers with its own name, so a route shows which handler ran.
const fake = () => {
  const methods = new Map<string | symbol, unknown>()
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') return undefined
        if (!methods.has(property))
          methods.set(
            property,
            vi.fn(async () => ({ handled: String(property) })),
          )
        return methods.get(property)
      },
    },
  )
}

let app: INestApplication
let base: string

beforeAll(async () => {
  const providers: Type<unknown>[] = Reflect.getMetadata('providers', ActivitiesModule)
  const module = await Test.createTestingModule({
    controllers: Reflect.getMetadata('controllers', ActivitiesModule),
    providers: providers.map((provider) => ({ provide: provider, useValue: fake() })),
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches, since the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  base = `http://127.0.0.1:${port}/projects/${projectId}/activities`
})
afterAll(async () => app?.close())

const handled = async (path: string) => {
  const response = await fetch(`${base}${path}`)
  return { status: response.status, body: await response.json() }
}

describe('activity routes over HTTP', () => {
  it.each([
    ['/proof-upload-limits', 'proofUploadLimits'],
    ['/context', 'context'],
    ['/assignable-officers', 'assignableOfficers'],
    [`/${activityId}`, 'get'],
    ['', 'list'],
  ])('GET %s reaches the %s handler, not the :activityId detail route', async (path, name) => {
    expect(await handled(path)).toEqual({ status: 200, body: { handled: name } })
  })
})
