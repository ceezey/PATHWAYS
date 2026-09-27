import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { type ExecutionContext, ForbiddenException, RequestMethod, type Type } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
// Machine boundary support unit tests.
import { afterEach, describe, expect, it } from 'vitest'
import { AUTH_BOUNDARY_KEY } from '../../common/decorators/auth-boundary.decorator'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator'
import { ROLES_KEY } from '../../common/decorators/roles.decorator'
import { machineBudgetMiddleware } from '../../common/network/machine-request-budget'
import {
  MACHINE_PURPOSE,
  RulesMachineBoundary,
  releaseMachineInvocation,
  requireMachineInvocation,
} from './rules-machine-boundary'

const drain = 'a'.repeat(64)
const sweep = 'b'.repeat(64)
const responses: EventEmitter[] = []
afterEach(() => {
  for (const response of responses.splice(0)) response.emit('finish')
})
const fixture = () => {
  class Controller {
    drain() {}
    sweep() {}
    ordinary() {}
  }
  Reflect.defineMetadata(PATH_METADATA, 'internal/rules', Controller)
  for (const [method, purpose] of [
    ['drain', 'DRAIN'],
    ['sweep', 'SWEEP'],
  ] as const) {
    Reflect.defineMetadata(PATH_METADATA, method, Controller.prototype[method])
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.POST, Controller.prototype[method])
    Reflect.defineMetadata(MACHINE_PURPOSE, purpose, Controller.prototype[method])
  }
  let now = 100
  let configuration: unknown = { enabled: true, drainToken: drain, sweepToken: sweep }
  let providerThrows = false
  const boundary = new RulesMachineBoundary(
    new Reflector(),
    () => {
      if (providerThrows) throw new Error('Private provider failure')
      return configuration
    },
    [
      { controller: Controller, handler: Controller.prototype.drain, purpose: 'DRAIN' },
      { controller: Controller, handler: Controller.prototype.sweep, purpose: 'SWEEP' },
    ],
  )
  const request = Object.assign(new EventEmitter(), {
    url: '/api/internal/rules/drain',
    method: 'POST',
    rawHeaders: ['Authorization', `Bearer ${drain}`],
    headers: { authorization: `Bearer ${drain}` } as Record<string, unknown>,
    body: {} as unknown,
    query: {} as unknown,
    user: undefined as unknown,
    auth: undefined as unknown,
  })
  let handler = Controller.prototype.drain
  let controller: Type<object> = Controller
  const response = Object.assign(new EventEmitter(), { setHeader: () => {}, destroy: () => {} })
  responses.push(response)
  machineBudgetMiddleware('api', { now: () => now })(
    request as unknown as IncomingMessage,
    response as unknown as ServerResponse,
    () => {},
  )
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext
  return {
    boundary,
    request,
    context,
    Controller,
    setTime: (value: number) => {
      now = value
    },
    setConfig: (value: unknown) => {
      configuration = value
    },
    throwConfig: () => {
      providerThrows = true
    },
    selectClass: (value: Type<object>) => {
      controller = value
    },
    select: (value: typeof handler) => {
      handler = value
    },
  }
}
describe('exact machine boundary proposal', () => {
  it('accepts exact purpose with SYSTEM/null attribution and server-only bounded context', () => {
    const f = fixture()
    expect(f.boundary.enter(f.context)).toBe(true)
    const invocation = requireMachineInvocation(f.request, 'DRAIN')
    expect(invocation.origin).toBe('SYSTEM')
    expect(invocation.actorId).toBeNull()
    expect(invocation.remainingMs()).toBe(25000)
    expect(() => requireMachineInvocation(f.request, 'SWEEP')).toThrow(ForbiddenException)
    f.setTime(25100)
    expect(() => invocation.assertRemaining()).toThrow(ForbiddenException)
    releaseMachineInvocation(f.request)
    expect(() => requireMachineInvocation(f.request, 'DRAIN')).toThrow(ForbiddenException)
  })
  it('delegates ordinary handlers without changing existing human state', () => {
    const f = fixture()
    f.select(f.Controller.prototype.ordinary)
    f.request.user = { human: true }
    f.request.auth = { verified: true }
    expect(f.boundary.enter(f.context)).toBeNull()
    expect(f.request.user).toEqual({ human: true })
    expect(f.request.auth).toEqual({ verified: true })
  })
  it('accepts SWEEP only with its distinct credential and purpose', () => {
    const f = fixture()
    f.select(f.Controller.prototype.sweep)
    f.request.rawHeaders = ['Authorization', `Bearer ${sweep}`]
    f.request.headers.authorization = `Bearer ${sweep}`
    expect(f.boundary.enter(f.context)).toBe(true)
    expect(requireMachineInvocation(f.request, 'SWEEP').purpose).toBe('SWEEP')
    expect(() => requireMachineInvocation(f.request, 'DRAIN')).toThrow(ForbiddenException)
  })
  it.each(['\n', '\r', '\r\n'])(
    'rejects exact-token configuration plus newline suffix %j',
    (suffix) => {
      for (const key of ['drainToken', 'sweepToken']) {
        const f = fixture()
        f.setConfig({
          enabled: true,
          drainToken: drain,
          sweepToken: sweep,
          [key]: (key === 'drainToken' ? drain : sweep) + suffix,
        })
        expect(() => f.boundary.enter(f.context)).toThrow('Rule processing is unavailable.')
      }
    },
  )
  it.each(['\n', '\r', '\r\n'])('rejects exact bearer header plus newline suffix %j', (suffix) => {
    const f = fixture()
    const header = `Bearer ${drain}${suffix}`
    f.request.rawHeaders = ['Authorization', header]
    f.request.headers.authorization = header
    expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
  })
  it.each([null, undefined, [], '', 1, {}, { enabled: true, drainToken: null, sweepToken: sweep }])(
    'uniformly rejects malformed configuration %j',
    (value) => {
      const f = fixture()
      f.setConfig(value)
      expect(() => f.boundary.enter(f.context)).toThrow('Rule processing is unavailable.')
    },
  )
  it('denies provider failure without leaking its cause or creating context', () => {
    const f = fixture()
    f.throwConfig()
    expect(() => f.boundary.enter(f.context)).toThrow('Rule processing is unavailable.')
    expect(() => requireMachineInvocation(f.request, 'DRAIN')).toThrow(ForbiddenException)
  })
  it.each(['enabled', 'drainToken', 'sweepToken'])(
    'uniformly denies throwing configuration getter %s',
    (key) => {
      const f = fixture()
      const value = { enabled: true, drainToken: drain, sweepToken: sweep }
      Object.defineProperty(value, key, {
        get: () => {
          throw new Error('Private getter failure')
        },
      })
      f.setConfig(value)
      expect(() => f.boundary.enter(f.context)).toThrow('Rule processing is unavailable.')
      expect(() => requireMachineInvocation(f.request, 'DRAIN')).toThrow(ForbiddenException)
    },
  )
  it('snapshots stateful configuration getters once before validating and comparing', () => {
    const f = fixture()
    const reads = { enabled: 0, drainToken: 0, sweepToken: 0 }
    f.setConfig({
      get enabled() {
        return ++reads.enabled === 1
      },
      get drainToken() {
        return ++reads.drainToken === 1 ? drain : 'unchecked'
      },
      get sweepToken() {
        return ++reads.sweepToken === 1 ? sweep : drain
      },
    })
    expect(f.boundary.enter(f.context)).toBe(true)
    expect(reads).toEqual({ enabled: 1, drainToken: 1, sweepToken: 1 })
    expect(requireMachineInvocation(f.request, 'DRAIN').origin).toBe('SYSTEM')
  })
  it.each(['raw-value-array', 'raw-odd', 'normalized-array', 'raw-normalized-mismatch'] as const)(
    'rejects malformed raw/normalized header representation %s',
    (variant) => {
      const f = fixture()
      if (variant === 'raw-value-array')
        f.request.rawHeaders = ['Authorization', [drain]] as unknown as string[]
      if (variant === 'raw-odd') f.request.rawHeaders = ['Authorization']
      if (variant === 'normalized-array') f.request.headers.authorization = [`Bearer ${drain}`]
      if (variant === 'raw-normalized-mismatch') f.request.headers.authorization = `Bearer ${sweep}`
      expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
    },
  )
  it.each(['wrong-class', 'controller-path', 'handler-path', 'metadata-method'] as const)(
    'rejects mismatched exact registry/route metadata %s',
    (reason) => {
      const f = fixture()
      if (reason === 'wrong-class') {
        class Other {}
        f.selectClass(Other)
      }
      if (reason === 'controller-path')
        Reflect.defineMetadata(PATH_METADATA, 'internal/other', f.Controller)
      if (reason === 'handler-path')
        Reflect.defineMetadata(PATH_METADATA, 'other', f.Controller.prototype.drain)
      if (reason === 'metadata-method')
        Reflect.defineMetadata(METHOD_METADATA, RequestMethod.GET, f.Controller.prototype.drain)
      expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
    },
  )
  it.each([IS_PUBLIC_KEY, AUTH_BOUNDARY_KEY, PERMISSION_KEY, ROLES_KEY])(
    'rejects mixed human metadata on the controller %s',
    (key) => {
      const f = fixture()
      Reflect.defineMetadata(key, true, f.Controller)
      expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
    },
  )
  it.each(['false', 'empty', 'equal', 'uppercase'] as const)(
    'uniformly denies %s configuration',
    (variant) => {
      const f = fixture()
      f.setConfig({
        enabled: variant !== 'false',
        drainToken:
          variant === 'empty' ? '' : variant === 'uppercase' ? drain.toUpperCase() : drain,
        sweepToken: variant === 'equal' ? drain : sweep,
      })
      expect(() => f.boundary.enter(f.context)).toThrow('Rule processing is unavailable.')
    },
  )
  it.each(['bearer ', 'Bearer  ', 'Bearer\t', 'Basic ', 'Bearer '] as const)(
    'denies malformed scheme %s',
    (prefix) => {
      const f = fixture()
      const header = prefix + (prefix === 'Bearer ' ? 'A'.repeat(64) : drain)
      f.request.headers.authorization = header
      f.request.rawHeaders = ['Authorization', header]
      expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
    },
  )
  it.each([
    'duplicate',
    'comma',
    'query',
    'body',
    'cookie',
    'alternate',
    'wrong-purpose',
    'wrong-method',
  ] as const)('denies %s without creating invocation', (reason) => {
    const f = fixture()
    if (reason === 'duplicate') f.request.rawHeaders.push('authorization', `Bearer ${drain}`)
    if (reason === 'comma') {
      const h = `Bearer ${drain}, Bearer ${drain}`
      f.request.headers.authorization = h
      f.request.rawHeaders = ['Authorization', h]
    }
    if (reason === 'query') f.request.query = { token: drain }
    if (reason === 'body') f.request.body = { projectId: 'caller-scope' }
    if (reason === 'cookie') f.request.rawHeaders.push('Cookie', 'token=synthetic')
    if (reason === 'alternate') f.request.rawHeaders.push('X-Api-Key', drain)
    if (reason === 'wrong-purpose') f.select(f.Controller.prototype.sweep)
    if (reason === 'wrong-method') f.request.method = 'GET'
    expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
    expect(() => requireMachineInvocation(f.request, 'DRAIN')).toThrow(ForbiddenException)
  })
  it.each([
    IS_PUBLIC_KEY,
    AUTH_BOUNDARY_KEY,
    PERMISSION_KEY,
    ROLES_KEY,
    'class-purpose',
    'unregistered',
  ] as const)('rejects mixed or misplaced metadata %s', (key) => {
    const f = fixture()
    if (key === 'class-purpose') Reflect.defineMetadata(MACHINE_PURPOSE, 'DRAIN', f.Controller)
    else if (key === 'unregistered') {
      Reflect.defineMetadata(MACHINE_PURPOSE, 'DRAIN', f.Controller.prototype.ordinary)
      f.select(f.Controller.prototype.ordinary)
    } else Reflect.defineMetadata(key, true, f.Controller.prototype.drain)
    expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
  })
  it('preserves the entry deadline rather than resetting it after authentication', () => {
    const f = fixture()
    f.setTime(26000)
    expect(() => f.boundary.enter(f.context)).toThrow(ForbiddenException)
  })
})
