import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import {
  ForbiddenException,
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common'
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { AuthorizedDataController } from './authorized-data.controller'
import { AuthorizedDataService } from './authorized-data.service'

const actor = { id: '75000000-0000-4000-8000-000000000003' } as ApplicationIdentity
const projectId = '75000000-0000-4000-8000-000000000004'
const data = { projects: vi.fn(), beneficiaries: vi.fn(), beneficiaryAggregate: vi.fn() }
const controller = new AuthorizedDataController(data as unknown as AuthorizedDataService)
const anonymous: AuthenticatedRequest = { headers: {} }
const signedIn: AuthenticatedRequest = { headers: {}, user: actor }

beforeEach(() => {
  for (const fn of Object.values(data)) fn.mockReset().mockResolvedValue([])
})

describe('authorized data controller application profile', () => {
  it('answers 403 before any service call when the request carries no application profile', () => {
    for (const call of [
      () => controller.projects(anonymous),
      () => controller.beneficiaries(anonymous, projectId),
      () => controller.aggregate(anonymous, projectId),
    ]) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Application profile is required.')
    }
    for (const fn of Object.values(data)) expect(fn).not.toHaveBeenCalled()
  })

  it('passes the verified profile to the service', async () => {
    await controller.projects(signedIn)
    await controller.beneficiaries(signedIn, projectId)
    await controller.aggregate(signedIn, projectId)
    expect(data.projects).toHaveBeenCalledWith(actor)
    expect(data.beneficiaries).toHaveBeenCalledWith(actor, projectId)
    expect(data.beneficiaryAggregate).toHaveBeenCalledWith(actor, projectId)
  })
})

describe('authorized data controller routes', () => {
  it('registers three read routes with their permission, step-up rule and no-store header', () => {
    const prototype = AuthorizedDataController.prototype as unknown as Record<string, () => void>
    const names = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor')
    expect(Reflect.getMetadata(PATH_METADATA, AuthorizedDataController)).toBe('access')
    expect(
      names.map((name) => [
        name,
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, prototype[name])],
        Reflect.getMetadata(PATH_METADATA, prototype[name]),
        Reflect.getMetadata(PERMISSION_KEY, prototype[name]),
        Reflect.getMetadata(BENEFICIARY_STEP_UP_KEY, prototype[name]) ?? false,
        Reflect.getMetadata(HEADERS_METADATA, prototype[name]),
      ]),
    ).toEqual([
      [
        'projects',
        'GET',
        'projects',
        'projects.read',
        false,
        [{ name: 'Cache-Control', value: 'no-store' }],
      ],
      [
        'beneficiaries',
        'GET',
        'projects/:projectId/beneficiaries',
        'beneficiaries.records.read',
        true,
        [{ name: 'Cache-Control', value: 'no-store' }],
      ],
      [
        'aggregate',
        'GET',
        'projects/:projectId/beneficiary-aggregate',
        'beneficiaries.aggregates.read',
        false,
        [{ name: 'Cache-Control', value: 'no-store' }],
      ],
    ])
  })
})

describe('authorized data controller router', () => {
  let app: INestApplication
  let base: string

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthorizedDataController],
      providers: [{ provide: AuthorizedDataService, useValue: data }],
    }).compile()
    app = module.createNestApplication({ logger: false })
    // Stands in for the identity the auth guard attaches; the guard is not under test here.
    app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
      request.user = actor
      next()
    })
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        forbidUnknownValues: false,
      }),
    )
    await app.listen(0, '127.0.0.1')
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/access`
  })
  afterAll(async () => app?.close())

  it.each([
    ['beneficiaries', 'beneficiaries'],
    ['beneficiary-aggregate', 'beneficiaryAggregate'],
  ] as const)('passes the project id from the path of the %s route', async (segment, method) => {
    const response = await fetch(`${base}/projects/${projectId}/${segment}`)
    expect(response.status).toBe(200)
    expect(data[method]).toHaveBeenCalledWith(actor, projectId)
  })
})
