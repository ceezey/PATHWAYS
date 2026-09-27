import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { machineBudgetMiddleware } from '../network/machine-request-budget'
import 'reflect-metadata'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { readApiEnv } from '@pathways/config'
import { describe, expect, it, vi } from 'vitest'
import { TokenAuthService } from '../../modules/auth/token-auth.service'
import { WorkspaceResolutionService } from '../../modules/auth/workspace-resolution.service'
import { RulesMachineBoundary } from '../../modules/rules/rules-machine-boundary'
import { rulesMachineOptions } from '../../modules/rules/rules-machine-options'
import { RulesMachineController } from '../../modules/rules/rules-machine.controller'
import { RulesMachineModule } from '../../modules/rules/rules-machine.module'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { SupabaseAuthGuard } from './supabase-auth.guard'

function fixture(enabled = true) {
  const tokens = { verifyCurrent: vi.fn(), assertSessionLive: vi.fn() }
  const workspaces = { resolveSelection: vi.fn() }
  const request = Object.assign(new EventEmitter(), {
    url: '/api/internal/rules/drain',
    method: 'POST',
    body: {},
    query: {},
    rawHeaders: ['Authorization', `Bearer ${'a'.repeat(64)}`],
    headers: { authorization: `Bearer ${'a'.repeat(64)}` },
    user: { forged: true },
    auth: { forged: true },
  })
  const response = Object.assign(new EventEmitter(), { setHeader: vi.fn(), destroy: vi.fn() })
  machineBudgetMiddleware('api')(
    request as unknown as IncomingMessage,
    response as unknown as ServerResponse,
    () => {},
  )
  const context = {
    getClass: () => RulesMachineController,
    getHandler: () => RulesMachineController.prototype.drain,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext
  const reflector = new Reflector()
  const boundary = new RulesMachineBoundary(
    reflector,
    () => ({ enabled, drainToken: 'a'.repeat(64), sweepToken: 'b'.repeat(64) }),
    [
      {
        controller: RulesMachineController,
        handler: RulesMachineController.prototype.drain,
        purpose: 'DRAIN',
      },
      {
        controller: RulesMachineController,
        handler: RulesMachineController.prototype.sweep,
        purpose: 'SWEEP',
      },
    ],
  )
  const guard = new SupabaseAuthGuard(
    reflector,
    tokens as unknown as TokenAuthService,
    workspaces as unknown as WorkspaceResolutionService,
    boundary,
  )
  return { tokens, workspaces, request, response, context, guard }
}
describe('mandatory machine boundary before human/Public delegation', () => {
  it('resolves the mandatory global guard dependency through disabled dynamic module exports', async () => {
    const module = await Test.createTestingModule({
      imports: [RulesMachineModule.register(rulesMachineOptions(readApiEnv({})))],
      providers: [
        Reflector,
        SupabaseAuthGuard,
        { provide: TokenAuthService, useValue: { verifyCurrent: vi.fn() } },
        { provide: WorkspaceResolutionService, useValue: { resolveSelection: vi.fn() } },
      ],
    }).compile()
    try {
      const f = fixture(false)
      await expect(module.get(SupabaseAuthGuard).canActivate(f.context)).rejects.toThrow(
        'Rule processing is unavailable.',
      )
      expect(module.get(TokenAuthService).verifyCurrent).not.toHaveBeenCalled()
    } finally {
      await module.close()
    }
  })
  it('maps only validated server purpose credentials and database URLs into composition', () => {
    const options = rulesMachineOptions(
      readApiEnv({
        RULES_WORKER_ENABLED: 'true',
        RULES_DRAIN_TOKEN: 'a'.repeat(64),
        RULES_SWEEP_TOKEN: 'b'.repeat(64),
        RULES_WORKER_DATABASE_URL: 'postgresql://pathways_rules_worker@127.0.0.1/local',
        RULES_SWEEPER_DATABASE_URL: 'postgresql://pathways_rules_sweeper@127.0.0.1/local',
        RULES_RUNTIME_VERIFIED_MS: '30000',
        RULES_PERIODIC_DRAIN_VERIFIED: 'true',
      }),
    )
    expect(options).toEqual({
      enabled: true,
      drainToken: 'a'.repeat(64),
      sweepToken: 'b'.repeat(64),
      workerDatabaseUrl: 'postgresql://pathways_rules_worker@127.0.0.1/local',
      sweeperDatabaseUrl: 'postgresql://pathways_rules_sweeper@127.0.0.1/local',
    })
  })
  it('admits only exact server capability without human Auth/profile calls or injected request roles', async () => {
    const f = fixture()
    expect(await f.guard.canActivate(f.context)).toBe(true)
    expect(f.request.user).toBeUndefined()
    expect(f.request.auth).toBeUndefined()
    expect(f.tokens.verifyCurrent).not.toHaveBeenCalled()
    expect(f.tokens.assertSessionLive).not.toHaveBeenCalled()
    expect(f.workspaces.resolveSelection).not.toHaveBeenCalled()
    expect(f.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
  })
  it.each([
    'missing',
    'humanJWT',
    'wrongPurpose',
    'lowercaseBearer',
    'duplicate',
    'wrongMethod',
    'bodyScope',
    'queryScope',
    'cookie',
  ])('uniformly denies%s without human fallback', async (kind) => {
    const f = fixture()
    if (kind === 'missing') {
      f.request.rawHeaders = []
      f.request.headers.authorization = ''
    }
    if (kind === 'humanJWT') {
      f.request.headers.authorization = 'Bearer eyJhbGci.fake.sig'
      f.request.rawHeaders = ['Authorization', f.request.headers.authorization]
    }
    if (kind === 'wrongPurpose') {
      f.request.headers.authorization = `Bearer ${'b'.repeat(64)}`
      f.request.rawHeaders = ['Authorization', f.request.headers.authorization]
    }
    if (kind === 'lowercaseBearer') {
      f.request.headers.authorization = `bearer ${'a'.repeat(64)}`
      f.request.rawHeaders = ['Authorization', f.request.headers.authorization]
    }
    if (kind === 'duplicate')
      f.request.rawHeaders.push('Authorization', f.request.headers.authorization)
    if (kind === 'wrongMethod') f.request.method = 'GET'
    if (kind === 'bodyScope') Object.assign(f.request.body, { organizationId: 'forged' })
    if (kind === 'queryScope') Object.assign(f.request.query, { projectId: 'forged' })
    if (kind === 'cookie') f.request.rawHeaders.push('Cookie', 'human-session=forged')
    await expect(f.guard.canActivate(f.context)).rejects.toThrow('Rule processing is unavailable.')
    expect(f.tokens.verifyCurrent).not.toHaveBeenCalled()
    expect(f.workspaces.resolveSelection).not.toHaveBeenCalled()
  })
  it('denies disabled feature and misplaced Public annotation before any Public shortcut', async () => {
    const disabled = fixture(false)
    await expect(disabled.guard.canActivate(disabled.context)).rejects.toThrow(
      'Rule processing is unavailable.',
    )
    expect(disabled.tokens.verifyCurrent).not.toHaveBeenCalled()
    const f = fixture()
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, RulesMachineController.prototype.drain)
    try {
      await expect(f.guard.canActivate(f.context)).rejects.toThrow(
        'Rule processing is unavailable.',
      )
      expect(f.tokens.verifyCurrent).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteMetadata(IS_PUBLIC_KEY, RulesMachineController.prototype.drain)
    }
  })
})
