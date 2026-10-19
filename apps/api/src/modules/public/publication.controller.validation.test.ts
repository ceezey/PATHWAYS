import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { PublicService } from './public.service'
import { PublicationController } from './publication.controller'

const projectId = 'abcdefab-0000-4000-8000-000000000001'
const actor = { id: 'abcdefab-0000-4000-8000-000000000003', aal: 'aal2' }
// The real service answers the body parse; the prisma stub is never reached by a bad body.
const service = new PublicService({} as PrismaService)
const transition = vi.spyOn(service, 'transition')
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [PublicationController],
    providers: [{ provide: PublicService, useValue: service }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  // Same global validation as main.ts, so each route sees the production pipe chain.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  base = `http://127.0.0.1:${port}/projects/${projectId}/publication`
})

beforeEach(() => {
  transition.mockClear()
})
afterAll(async () => app?.close())

const routes = [
  ['submit', 'SUBMIT'],
  ['approve', 'APPROVE'],
  ['publish', 'PUBLISH'],
  ['withdraw', 'WITHDRAW'],
] as const

describe('publication routes leave the body to the service', () => {
  it.each(routes)(
    '%s hands a body outside the schema to the service unchanged',
    async (path, operation) => {
      const body = { clientRequestId: 'not-a-uuid', expectedRevision: -1, extra: { nested: true } }
      const response = await fetch(`${base}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      // A pipe on the body would answer a message list instead of the service's fixed text.
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ message: 'Invalid publication request.' })
      expect(transition).toHaveBeenCalledOnce()
      expect(transition).toHaveBeenCalledWith(actor, projectId, operation, body)
    },
  )
})
