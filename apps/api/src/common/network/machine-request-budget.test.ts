import 'reflect-metadata'
import { EventEmitter } from 'node:events'
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
  request as httpRequest,
} from 'node:http'
import { performance } from 'node:perf_hooks'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it, vi } from 'vitest'
import {
  RulesMachineBoundary,
  requireMachineInvocation,
} from '../../modules/rules/rules-machine-boundary'
import { RulesMachineController } from '../../modules/rules/rules-machine.controller'
import { machineBudgetMiddleware, machineRequestEntry } from './machine-request-budget'

function budgetFixture(url = '/api/internal/rules/drain', method = 'POST') {
  let now = 100
  const req = Object.assign(new EventEmitter(), { url, method, headers: {}, rawHeaders: [] })
  const res = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    destroy: vi.fn(),
    end: vi.fn(),
    writableFinished: false,
    statusCode: 200,
  })
  const next = vi.fn()
  machineBudgetMiddleware('/api/', { now: () => now })(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    next,
  )
  return {
    req,
    res,
    next,
    setTime: (value: number) => {
      now = value
    },
  }
}
function boundContext(req: IncomingMessage, res: ServerResponse) {
  return {
    getClass: () => RulesMachineController,
    getHandler: () => RulesMachineController.prototype.drain,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext
}
const boundary = () =>
  new RulesMachineBoundary(
    new Reflector(),
    () => ({ enabled: true, drainToken: 'a'.repeat(64), sweepToken: 'b'.repeat(64) }),
    [
      {
        controller: RulesMachineController,
        handler: RulesMachineController.prototype.drain,
        purpose: 'DRAIN',
      },
    ],
  )

describe('machine pre-parser server timing only', () => {
  it('counts pre-guard/body time, carries abort state, and cleans timers/listeners on finish', () => {
    const f = budgetFixture()
    const entry = machineRequestEntry(f.req)
    expect(entry?.enteredAt).toBe(100)
    f.setTime(600)
    expect(entry?.remainingMs()).toBe(24500)
    f.res.emit('finish')
    expect(entry?.signal.aborted).toBe(true)
    expect(machineRequestEntry(f.req)).toBeUndefined()
    expect(f.req.listenerCount('aborted')).toBe(0)
    expect(f.res.listenerCount('close')).toBe(0)
    expect(() => entry?.check()).toThrow('Rule processing is unavailable.')
  })
  it.each(['aborted', 'close'])(
    'cancels disconnected %s without leaking the registered entry',
    (event) => {
      const f = budgetFixture()
      const entry = machineRequestEntry(f.req)
      ;(event === 'aborted' ? f.req : f.res).emit(event)
      expect(entry?.signal.aborted).toBe(true)
      expect(f.res.destroy).toHaveBeenCalledOnce()
      expect(machineRequestEntry(f.req)).toBeUndefined()
    },
  )
  it.each([
    '/api/internal/rules/drain?',
    '/api/internal/rules/drain?scope=x',
    '/api/internal/rules/%64rain',
    '//api/internal/rules/drain',
    '/API/internal/rules/drain',
    '/api/internal/rules/drain/',
  ])('uniformly rejects unsupported machine route%s before parsing', (url) => {
    const f = budgetFixture(url)
    expect(f.next).not.toHaveBeenCalled()
    expect(f.res.statusCode).toBe(403)
    expect(f.res.end).toHaveBeenCalledWith(
      JSON.stringify({
        message: 'Rule processing is unavailable.',
        error: 'Forbidden',
        statusCode: 403,
      }),
    )
    expect(machineRequestEntry(f.req)).toBeUndefined()
  })
  it('leaves unrelated human requests unchanged and grants no authentication/capability', () => {
    const human = budgetFixture('/api/projects', 'POST')
    expect(human.next).toHaveBeenCalledOnce()
    expect(machineRequestEntry(human.req)).toBeUndefined()
    expect(human.res.setHeader).not.toHaveBeenCalled()
    const machine = budgetFixture()
    expect(() => requireMachineInvocation(machine.req, 'DRAIN')).toThrow(
      'Rule processing is unavailable.',
    )
    machine.res.emit('finish')
  })
  it('requires a pre-parser registration even after exact method/binding/credential validation', () => {
    const req = {
      method: 'POST',
      body: {},
      query: {},
      rawHeaders: ['Authorization', `Bearer ${'a'.repeat(64)}`],
      headers: { authorization: `Bearer ${'a'.repeat(64)}` },
    }
    const context = boundContext(
      req as unknown as IncomingMessage,
      { setHeader: vi.fn() } as unknown as ServerResponse,
    )
    expect(() => boundary().enter(context)).toThrow('Rule processing is unavailable.')
  })
  it('physically closes a slow unfinished request body before the body parser/guard can run', async () => {
    const enteredGuard = vi.fn()
    const middleware = machineBudgetMiddleware('api', { durationMs: 80 })
    const server = createServer((req, res) =>
      middleware(req, res, () => {
        req.on('data', () => {})
        req.on('end', () => {
          enteredGuard()
          res.end('unexpected')
        })
      }),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('Expected local ephemeral socket')
    const start = performance.now()
    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port: address.port,
            path: '/api/internal/rules/drain',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': '100' },
          },
          () => reject(Error('Unexpected completed body response')),
        )
        const timer = setTimeout(() => {
          req.destroy()
          reject(Error('Slow body was not bounded'))
        }, 1000)
        req.once('error', () => {
          clearTimeout(timer)
          resolve()
        })
        req.write('{')
      })
      expect(performance.now() - start).toBeLessThan(1000)
      expect(enteredGuard).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
  it('carries the original request clock into the real boundary and cleans a successful HTTP response', async () => {
    const observed: number[] = []
    const middleware = machineBudgetMiddleware('api')
    const server = createServer((req, res) =>
      middleware(req, res, () => {
        req.on('data', () => {})
        req.on('end', () => {
          Object.assign(req, { body: {}, query: {} })
          const entry = machineRequestEntry(req)
          if (!entry) throw Error('Missing server entry')
          const b = boundary()
          b.enter(boundContext(req, res))
          const invocation = requireMachineInvocation(req, 'DRAIN')
          observed.push(invocation.enteredAt - entry.enteredAt)
          res.end(JSON.stringify({ state: 'ACKNOWLEDGED' }))
        })
      }),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('Expected local ephemeral socket')
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port: address.port,
            path: '/api/internal/rules/drain',
            method: 'POST',
            headers: {
              Authorization: `Bearer ${'a'.repeat(64)}`,
              'Content-Type': 'application/json',
            },
          },
          (res) => {
            let body = ''
            res.on('data', (chunk) => {
              body += chunk
            })
            res.on('end', () => resolve(body))
          },
        )
        req.on('error', reject)
        req.end('{}')
      })
      expect(output).toBe(JSON.stringify({ state: 'ACKNOWLEDGED' }))
      expect(observed).toEqual([0])
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
