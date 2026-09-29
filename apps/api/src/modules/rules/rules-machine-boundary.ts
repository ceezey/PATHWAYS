// Exact server-bound machine authentication; HTTP entry timing is separate.
import { timingSafeEqual } from 'node:crypto'
import { type ExecutionContext, ForbiddenException, RequestMethod, type Type } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import type { Reflector } from '@nestjs/core'
import { AUTH_BOUNDARY_KEY } from '../../common/decorators/auth-boundary.decorator'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator'
import { ROLES_KEY } from '../../common/decorators/roles.decorator'
import { machineRequestEntry } from '../../common/network/machine-request-budget'

export const MACHINE_PURPOSE = 'pathways:rules-machine-purpose'
export type Purpose = 'DRAIN' | 'SWEEP'
export type MachineConfig = Readonly<{ enabled: boolean; drainToken: string; sweepToken: string }>
export type Binding = Readonly<{
  controller: Type<object>
  handler: (...args: never[]) => unknown
  purpose: Purpose
}>
type Request = {
  method?: string
  rawHeaders?: unknown
  headers?: Record<string, unknown>
  body?: unknown
  query?: unknown
  user?: unknown
  auth?: unknown
}
export type MachineInvocation = Readonly<{
  purpose: Purpose
  origin: 'SYSTEM'
  actorId: null
  enteredAt: number
  deadlineAt: number
  remainingMs: () => number
  assertRemaining: () => void
}>
const tokens = /^[a-f0-9]{64}$/
const validToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 64 && tokens.test(value)
function deny(): never {
  throw new ForbiddenException('Rule processing is unavailable.')
}
const empty = (value: unknown) =>
  value === undefined ||
  (value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Reflect.ownKeys(value).length === 0)
const contexts = new WeakMap<object, MachineInvocation>()

// Exact bindings are constructed by the module from actual controller method
// references, never from a request, pathname, header or dynamic metadata map.
export class RulesMachineBoundary {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: () => unknown,
    private readonly bindings: readonly Binding[],
  ) {}

  enter(context: ExecutionContext): boolean | null {
    const handler = context.getHandler()
    const controller = context.getClass()
    const declared = this.reflector.get<unknown>(MACHINE_PURPOSE, handler)
    const classPurpose = this.reflector.get<unknown>(MACHINE_PURPOSE, controller)
    const binding = this.bindings.find((b) => b.handler === handler && b.controller === controller)
    // Any misplaced annotation is rejected before the human/Public delegate.
    if (!binding && declared === undefined && classPurpose === undefined) return null
    const request = context.switchToHttp().getRequest<Request>()
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader: (key: string, value: string) => void }>()
    response.setHeader('Cache-Control', 'private, no-store')
    contexts.delete(request)
    request.user = undefined
    request.auth = undefined
    if (
      !binding ||
      declared !== binding.purpose ||
      classPurpose !== undefined ||
      request.method !== 'POST' ||
      this.reflector.get<unknown>(PATH_METADATA, controller) !== 'internal/rules' ||
      this.reflector.get<unknown>(PATH_METADATA, handler) !==
        (binding.purpose === 'DRAIN' ? 'drain' : 'sweep') ||
      this.reflector.get<unknown>(METHOD_METADATA, handler) !== RequestMethod.POST
    )
      deny()
    for (const target of [controller, handler]) {
      for (const key of [IS_PUBLIC_KEY, AUTH_BOUNDARY_KEY, PERMISSION_KEY, ROLES_KEY]) {
        if (this.reflector.get<unknown>(key, target) !== undefined) deny()
      }
    }
    if (!empty(request.body) || !empty(request.query)) deny()
    const raw = request.rawHeaders
    if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.some((v) => typeof v !== 'string'))
      deny()
    const authorization: string[] = []
    const forbidden = new Set([
      'cookie',
      'proxy-authorization',
      'x-api-key',
      'x-auth-token',
      'x-pathways-organization-id',
      'x-pathways-user-id',
    ])
    for (let i = 0; i < raw.length; i += 2) {
      const name = raw[i].toLowerCase()
      if (forbidden.has(name)) deny()
      if (name === 'authorization') authorization.push(raw[i + 1])
    }
    const header = request.headers?.authorization
    if (
      authorization.length !== 1 ||
      typeof header !== 'string' ||
      header.length !== 71 ||
      header !== authorization[0] ||
      !/^Bearer [a-f0-9]{64}$/.test(header)
    )
      deny()
    for (const name of forbidden) if (request.headers?.[name] !== undefined) deny()
    let configuration: MachineConfig
    try {
      const candidate = this.config()
      if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) deny()
      const value = candidate as Partial<MachineConfig>
      const enabled = value.enabled
      const drainToken = value.drainToken
      const sweepToken = value.sweepToken
      // Validate exact token length before regex matching and hex decoding.
      if (
        enabled !== true ||
        !validToken(drainToken) ||
        !validToken(sweepToken) ||
        drainToken === sweepToken
      )
        deny()
      configuration = { enabled: true, drainToken, sweepToken }
    } catch {
      return deny()
    }
    const expected =
      binding.purpose === 'DRAIN' ? configuration.drainToken : configuration.sweepToken
    if (!timingSafeEqual(Buffer.from(header.slice(7), 'hex'), Buffer.from(expected, 'hex'))) deny()
    const entry = machineRequestEntry(request)
    if (!entry) deny()
    const { enteredAt, deadlineAt, remainingMs } = entry
    const assertRemaining = () => {
      try {
        entry.check()
      } catch {
        deny()
      }
      if (remainingMs() === 0) deny()
    }
    assertRemaining()
    contexts.set(
      request,
      Object.freeze({
        purpose: binding.purpose,
        origin: 'SYSTEM',
        actorId: null,
        enteredAt,
        deadlineAt,
        remainingMs,
        assertRemaining,
      }),
    )
    return true
  }
}

// Controller must consume exact expected purpose; caller input cannot create one.
export function requireMachineInvocation(request: object, purpose: Purpose): MachineInvocation {
  const value = contexts.get(request)
  if (!value || value.purpose !== purpose) deny()
  value.assertRemaining()
  return value
}
export function releaseMachineInvocation(request: object) {
  contexts.delete(request)
}
