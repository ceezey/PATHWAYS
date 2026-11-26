import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { readApiEnv } from '@pathways/config'

import { clientAddress, visitorAddress } from '../network/client-address'
import { RateLimitService } from './rate-limit.service'

type Hit = readonly [bucket: string, maxHits: number]
type Request = IncomingMessage & { body?: unknown }

/** One entry per limited route: the buckets it counts, each with its per-minute maximum. */
const POLICIES = {
  'sign-in': (request: Request): Hit[] => {
    const address = clientAddress(request)
    const email = (request.body as { email?: unknown } | undefined)?.email
    const hits: Hit[] = [[`signin-ip:${address}`, 30]]
    // A whole office shares one address, so the pair limit is the tighter, per-account one; the cap keeps the bucket short.
    if (typeof email === 'string')
      hits.push([`signin-pair:${address}:${email.trim().toLowerCase().slice(0, 254)}`, 10])
    return hits
  },
  // Empty token turns this limit off, so a deployment without the web server's forwarding does not share one visitor budget.
  'public-analytics': (request: Request, token: string): Hit[] =>
    token ? [[`analytics:${visitorAddress(request, token)}`, 120]] : [],
  'public-media': (request: Request): Hit[] => [[`media:${clientAddress(request)}`, 300]],
} satisfies Record<string, (request: Request, visitorToken: string) => Hit[]>

export type RateLimitPolicy = keyof typeof POLICIES
const POLICY_KEY = 'pathways:rate-limit'

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly visitorToken = readApiEnv(process.env).PUBLIC_VISITOR_TOKEN

  constructor(
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<RateLimitPolicy>(POLICY_KEY, context.getHandler())
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const waits = await Promise.all(
      POLICIES[policy](request, this.visitorToken).map(([bucket, maxHits]) =>
        this.limits.hit(bucket, maxHits),
      ),
    )
    const wait = Math.max(0, ...waits)
    if (wait === 0) return true
    http.getResponse<ServerResponse>().setHeader('Retry-After', String(wait))
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again shortly.',
        retryAfterSeconds: wait,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
}

/** Limits a route by the named policy, counted in the database. */
export const RateLimit = (policy: RateLimitPolicy) =>
  applyDecorators(SetMetadata(POLICY_KEY, policy), UseGuards(RateLimitGuard))
