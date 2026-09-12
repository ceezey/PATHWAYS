import 'reflect-metadata'
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Controller, Get, type INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard'
import { PrismaService } from '../../prisma/prisma.service'
import { DEVELOPER_AUTH_UUID, DEVELOPER_SUPABASE_URL } from './developer-access'
import { SessionLivenessService } from './session-liveness.service'
import { TokenAuthService } from './token-auth.service'
import { WorkspaceResolutionService } from './workspace-resolution.service'

@Controller('liveness-test')
class TestController {
  @Get('protected')
  @RequirePermission('projects.read')
  protected() {
    return { allowed: true }
  }

  @Get('public')
  @Public()
  public() {
    return { public: true }
  }
}

// Enabled only by the repository's fresh, synthetic loopback-cluster runner.
// No .env or externally supplied connection URL is accepted.
const enabled = process.env.PATHWAYS_SESSION_LIVENESS_LOCAL_TESTS === '1'
describe.skipIf(!enabled)(
  'session liveness through real PostgreSQL, Supabase signature verification and HTTP guard',
  () => {
    let admin: PrismaClient
    let runtime: PrismaClient
    let app: INestApplication
    let port: number
    const sessionId = '30000000-0000-4000-8000-000000000001'
    const otherUser = '30000000-0000-4000-8000-000000000002'
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const kid = 'synthetic-session-liveness-test'
    const workspaces = { resolveSelection: vi.fn() }
    const token = () => {
      const now = Math.floor(Date.now() / 1000)
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const body = `${encode({ alg: 'ES256', typ: 'JWT', kid })}.${encode({
        iss: `${DEVELOPER_SUPABASE_URL}/auth/v1`,
        aud: 'authenticated',
        role: 'authenticated',
        sub: DEVELOPER_AUTH_UUID,
        session_id: sessionId,
        is_anonymous: false,
        iat: now - 30,
        exp: now + 3600,
        aal: 'aal2',
        amr: [
          { method: 'password', timestamp: now - 30 },
          { method: 'totp', timestamp: now - 10 },
        ],
      })}`
      return `${body}.${sign('sha256', Buffer.from(body), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
    }
    const get = (bearer: string, pathname = '/liveness-test/protected') =>
      new Promise<{
        status: number | undefined
        body: string
        cache: string | undefined
      }>((resolve, reject) => {
        const outgoing = request(
          {
            host: '127.0.0.1',
            port,
            path: pathname,
            headers: { Authorization: `Bearer ${bearer}` },
          },
          (response) => {
            let body = ''
            response.setEncoding('utf8')
            response.on('data', (chunk) => {
              body += chunk
            })
            response.on('end', () =>
              resolve({
                status: response.statusCode,
                body,
                cache: response.headers['cache-control'],
              }),
            )
          },
        )
        outgoing.on('error', reject)
        outgoing.end()
      })

    beforeAll(async () => {
      admin = new PrismaClient({
        datasourceUrl:
          'postgresql://postgres@127.0.0.1:55449/pathways_liveness_review?sslmode=disable&connection_limit=1',
      })
      runtime = new PrismaClient({
        datasourceUrl:
          'postgresql://pathways_runtime@127.0.0.1:55449/pathways_liveness_review?sslmode=disable&connection_limit=1',
      })
      const [target] = await admin.$queryRaw<Array<{ safe: boolean }>>`
      SELECT current_database()='pathways_liveness_review'
        AND inet_server_addr()='127.0.0.1'::inet AND inet_server_port()=55449 AS safe
    `
      if (!target?.safe) throw new Error('Refusing non-disposable test target')
      const module = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: PrismaService, useValue: runtime },
          SessionLivenessService,
          TokenAuthService,
          { provide: WorkspaceResolutionService, useValue: workspaces },
          { provide: APP_GUARD, useClass: SupabaseAuthGuard },
        ],
      }).compile()
      app = module.createNestApplication({ logger: false })
      await app.listen(0, '127.0.0.1')
      port = (app.getHttpServer().address() as AddressInfo).port
    })
    beforeEach(async () => {
      vi.stubEnv('SUPABASE_URL', DEVELOPER_SUPABASE_URL)
      vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_synthetic_liveness_test')
      vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true')
      vi.stubGlobal('crypto', webcrypto)
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input)
          if (url.endsWith('/auth/v1/.well-known/jwks.json'))
            return Response.json({
              keys: [
                {
                  ...keys.publicKey.export({ format: 'jwk' }),
                  kid,
                  alg: 'ES256',
                  use: 'sig',
                },
              ],
            })
          if (url === `${DEVELOPER_SUPABASE_URL}/auth/v1/user`)
            return Response.json({
              id: DEVELOPER_AUTH_UUID,
              is_anonymous: false,
              factors: [{ factor_type: 'totp', status: 'verified', id: sessionId }],
            })
          throw new Error('Unexpected provider path in isolated test')
        }),
      )
      workspaces.resolveSelection.mockReset().mockResolvedValue({
        roles: ['SYSTEM_ADMINISTRATOR'],
        permissions: ['projects.read'],
      })
      await admin.$executeRaw`DELETE FROM auth.sessions WHERE id=${sessionId}::uuid`
      await admin.$executeRaw`INSERT INTO auth.sessions(id,user_id) VALUES(${sessionId}::uuid,${DEVELOPER_AUTH_UUID}::uuid)`
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })
    afterAll(async () => {
      await app?.close()
      await admin?.$disconnect()
      await runtime?.$disconnect()
    })

    it('rejects the same unexpired JWT immediately after committed session removal, before membership', async () => {
      const bearer = token()
      expect((await get(bearer)).status).toBe(200)
      await admin.$executeRaw`DELETE FROM auth.sessions WHERE id=${sessionId}::uuid`
      const denied = await get(bearer)
      expect(denied.status).toBe(401)
      expect(denied.cache).toBe('private, no-store')
      expect(denied.body).not.toContain(bearer)
      expect(denied.body).not.toContain(sessionId)
      expect(workspaces.resolveSelection).toHaveBeenCalledTimes(1)
    })
    it('rejects a still-present session that now belongs to another subject', async () => {
      await admin.$executeRaw`UPDATE auth.sessions SET user_id=${otherUser}::uuid WHERE id=${sessionId}::uuid`
      expect((await get(token())).status).toBe(401)
      expect(workspaces.resolveSelection).not.toHaveBeenCalled()
    })
    it('rejects not_after expiry and leaves public routes independent', async () => {
      await admin.$executeRaw`UPDATE auth.sessions SET not_after=statement_timestamp()-interval '1 second' WHERE id=${sessionId}::uuid`
      expect((await get(token())).status).toBe(401)
      expect((await get('invalid', '/liveness-test/public')).status).toBe(200)
    })
    it('fails closed on a missing function and recovers only when the contract is restored', async () => {
      await admin.$executeRaw`ALTER FUNCTION pathways.runtime_auth_session_live(uuid,uuid) RENAME TO local_test_hidden`
      try {
        const denied = await get(token())
        expect(denied.status).toBe(503)
        expect(denied.cache).toBe('private, no-store')
        expect(denied.body).not.toMatch(/runtime_auth|query|30000000|postgresql/i)
        expect(workspaces.resolveSelection).not.toHaveBeenCalled()
      } finally {
        await admin.$executeRaw`ALTER FUNCTION pathways.local_test_hidden(uuid,uuid) RENAME TO runtime_auth_session_live`
      }
      expect((await get(token())).status).toBe(200)
    })
  },
)
