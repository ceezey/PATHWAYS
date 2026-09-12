import 'reflect-metadata'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Writable } from 'node:stream'

import { Controller, HttpCode, type INestApplication, Post, Req } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { LoggerModule } from 'nestjs-pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPathwaysPinoHttpOptions } from './app.module'

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const canaries = {
  applicationId: '10000000-0000-4000-8000-000000000001',
  organizationId: '20000000-0000-4000-8000-000000000002',
  workspaceId: '30000000-0000-4000-8000-000000000003',
  projectId: '40000000-0000-4000-8000-000000000004',
  userId: '50000000-0000-4000-8000-000000000005',
  authUserId: '60000000-0000-4000-8000-000000000006',
  authSubject: '70000000-0000-4000-8000-000000000007',
  bearer: 'stage3-bearer-token-canary',
  cookie: 'stage3-cookie-canary',
  body: 'stage3-request-body-canary',
  query: 'stage3-query-canary',
  callerRequestId: 'stage3-caller-request-id-canary',
}

type RequestLogger = {
  info: (bindings: Record<string, unknown>, message: string) => void
}

@Controller('logging-test')
class LoggingTestController {
  @Post('failure/:resourceId')
  @HttpCode(500)
  fail() {
    return { hiddenResponseBody: canaries.body }
  }

  @Post(':resourceId')
  handle(@Req() request: { log: RequestLogger }) {
    request.log.info(
      {
        headers: { authorization: `Bearer ${canaries.bearer}` },
        url: `/private/${canaries.organizationId}`,
        query: { token: canaries.query },
        params: { resourceId: canaries.workspaceId },
        body: { content: canaries.body },
        cookies: { session: canaries.cookie },
        cookie: canaries.cookie,
        authorization: `Bearer ${canaries.bearer}`,
        token: canaries.bearer,
        applicationId: canaries.applicationId,
        organizationId: canaries.organizationId,
        workspaceId: canaries.workspaceId,
        projectId: canaries.projectId,
        userId: canaries.userId,
        authUserId: canaries.authUserId,
        authSubject: canaries.authSubject,
        context: {
          organizationId: canaries.organizationId,
          workspaceId: canaries.workspaceId,
        },
      },
      'controller request event',
    )

    return { accepted: true }
  }
}

class LogCapture extends Writable {
  private readonly chunks: string[] = []

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.chunks.push(chunk.toString())
    callback()
  }

  text() {
    return this.chunks.join('')
  }
}

const capture = new LogCapture()
let app: INestApplication
let port: number

function postWithSensitiveRequestData(route = 'logging-test') {
  const body = JSON.stringify({ secret: canaries.body, workspaceId: canaries.workspaceId })

  return new Promise<{
    status: number
    requestId: string | undefined
  }>((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: `/${route}/${canaries.workspaceId}?token=${canaries.query}`,
        method: 'POST',
        headers: {
          authorization: `Bearer ${canaries.bearer}`,
          cookie: `session=${canaries.cookie}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-request-id': canaries.callerRequestId,
          'x-pathways-application-id': canaries.applicationId,
          'x-pathways-organization-id': canaries.organizationId,
          'x-pathways-user-id': canaries.userId,
        },
      },
      (response) => {
        response.resume()
        response.on('end', () => {
          const responseRequestId = response.headers['x-request-id']
          resolve({
            status: response.statusCode ?? 0,
            requestId:
              typeof responseRequestId === 'string' ? responseRequestId : responseRequestId?.[0],
          })
        })
      },
    )
    request.on('error', reject)
    request.end(body)
  })
}

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [
      LoggerModule.forRoot({
        pinoHttp: [createPathwaysPinoHttpOptions('production'), capture],
      }),
    ],
    controllers: [LoggingTestController],
  }).compile()

  app = module.createNestApplication({ logger: false })
  await app.listen(0, '127.0.0.1')
  port = (app.getHttpServer().address() as AddressInfo).port
})

afterAll(async () => app?.close())

describe('PATHWAYS request logging', () => {
  it('retains only method, status, response time and a server-generated request ID', async () => {
    const response = await postWithSensitiveRequestData()
    const failure = await postWithSensitiveRequestData('logging-test/failure')
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(response.status).toBe(201)
    expect(response.requestId).toMatch(requestIdPattern)
    expect(response.requestId).not.toBe(canaries.callerRequestId)
    expect(failure.status).toBe(500)
    expect(failure.requestId).toMatch(requestIdPattern)
    expect(failure.requestId).not.toBe(response.requestId)

    const output = capture.text()
    for (const canary of Object.values(canaries)) {
      expect(output).not.toContain(canary)
    }
    expect(output).not.toMatch(/authorization|cookie|headers|params|query|body|token/i)

    const entries = output
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    const received = entries.find((entry) => entry.msg === 'request received')
    const completed = entries.find((entry) => entry.msg === 'request completed')
    const application = entries.find((entry) => entry.msg === 'controller request event')
    const failed = entries.find((entry) => entry.msg === 'request failed')

    expect(received).toMatchObject({
      reqId: response.requestId,
      req: { id: response.requestId, method: 'POST' },
    })
    expect(application).toMatchObject({ reqId: response.requestId })
    expect(completed).toMatchObject({
      reqId: response.requestId,
      res: { statusCode: 201 },
    })
    expect(completed?.responseTime).toEqual(expect.any(Number))
    expect(completed?.responseTime).toBeGreaterThanOrEqual(0)
    expect(failed).toMatchObject({
      reqId: failure.requestId,
      res: { statusCode: 500 },
    })
    expect(failed?.responseTime).toEqual(expect.any(Number))
    expect(failed).not.toHaveProperty('err')
  })
})
