import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { machineBudgetMiddleware } from '../../common/network/machine-request-budget'
import 'reflect-metadata'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it, vi } from 'vitest'
import { RulesMachineBoundary, requireMachineInvocation } from './rules-machine-boundary'
import { RULES_ACTIVATION_DRAIN, RULES_MACHINE_SQL } from './rules-machine-worker'
import type { RulesMachineWorker } from './rules-machine-worker'
import { RulesMachineController } from './rules-machine.controller'
import { RulesMachineModule } from './rules-machine.module'

// The activation drain factory of a registered module, called with a stand-in worker.
function drainFactory(module: ReturnType<typeof RulesMachineModule.register>) {
  const provider = module.providers?.find(
    (value) =>
      typeof value === 'object' && 'provide' in value && value.provide === RULES_ACTIVATION_DRAIN,
  )
  if (!provider || typeof provider !== 'object' || !('useFactory' in provider))
    throw Error('Expected activation drain provider')
  return provider.useFactory as (worker: { drain: (invocation: unknown) => unknown }) => unknown
}

function fixture(purpose: 'drain' | 'sweep') {
  const request = Object.assign(new EventEmitter(), {
    url: '/api/internal/rules/drain',
    method: 'POST',
    body: {},
    query: {},
    rawHeaders: ['Authorization', `Bearer ${'a'.repeat(64)}`],
    headers: { authorization: `Bearer ${'a'.repeat(64)}` },
  })
  request.url = `/api/internal/rules/${purpose}`
  const response = Object.assign(new EventEmitter(), { setHeader: vi.fn(), destroy: vi.fn() })
  machineBudgetMiddleware('api')(
    request as unknown as IncomingMessage,
    response as unknown as ServerResponse,
    () => {},
  )
  const context = {
    getClass: () => RulesMachineController,
    getHandler: () => RulesMachineController.prototype[purpose],
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext
  const worker = {
    drain: vi.fn(async () => ({ state: 'ACKNOWLEDGED' as const })),
    sweep: vi.fn(async () => ({ state: 'ACKNOWLEDGED' as const })),
  }
  const boundary = new RulesMachineBoundary(
    new Reflector(),
    () => ({ enabled: true, drainToken: 'a'.repeat(64), sweepToken: 'b'.repeat(64) }),
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
  return {
    request,
    context,
    boundary,
    worker,
    controller: new RulesMachineController(worker as unknown as RulesMachineWorker),
  }
}
describe('exact machine controller/module bindings', () => {
  it('requires server-established capability and cannot be entered using forged request auth', async () => {
    const f = fixture('drain')
    Object.assign(f.request, { user: { role: 'SYSTEM' }, auth: { purpose: 'DRAIN' } })
    await expect(f.controller.drain(f.request)).rejects.toThrow('Rule processing is unavailable.')
    expect(f.worker.drain).not.toHaveBeenCalled()
  })
  it('consumes exact matching capability and releases it after success', async () => {
    const f = fixture('drain')
    expect(f.boundary.enter(f.context)).toBe(true)
    expect(await f.controller.drain(f.request)).toEqual({ state: 'ACKNOWLEDGED' })
    expect(() => requireMachineInvocation(f.request, 'DRAIN')).toThrow(
      'Rule processing is unavailable.',
    )
  })
  it('releases capability after worker rejection and cannot route drain credential to sweep', async () => {
    const f = fixture('drain')
    f.boundary.enter(f.context)
    f.worker.drain.mockRejectedValue(Error('Unavailable'))
    await expect(f.controller.drain(f.request)).rejects.toThrow('Unavailable')
    expect(() => requireMachineInvocation(f.request, 'DRAIN')).toThrow()
    const sweep = fixture('sweep')
    expect(() => sweep.boundary.enter(sweep.context)).toThrow('Rule processing is unavailable.')
    expect(sweep.worker.sweep).not.toHaveBeenCalled()
  })
  it('module disabled options construct no client and export only boundary for root guard wiring', async () => {
    const module = RulesMachineModule.register({
      enabled: false,
      drainToken: '',
      sweepToken: '',
      workerDatabaseUrl: '',
      sweeperDatabaseUrl: '',
    })
    expect(module.controllers).toEqual([RulesMachineController])
    expect(module.exports).toEqual([RulesMachineBoundary, RULES_ACTIVATION_DRAIN])
    expect(drainFactory(module)({ drain: vi.fn() })).toBeNull()
    const provider = module.providers?.find(
      (value) =>
        typeof value === 'object' && 'provide' in value && value.provide === RULES_MACHINE_SQL,
    )
    if (
      !provider ||
      typeof provider !== 'object' ||
      !('useFactory' in provider) ||
      typeof provider.useFactory !== 'function'
    )
      throw Error('Expected fixed SQL provider')
    const sql = provider.useFactory()
    await expect(sql.calendar()).rejects.toThrow('Rule processing is unavailable.')
    // Empty URLs would synchronously fail SQL client construction, proving the
    // disabled factory did not construct/open either dedicated client.
  })
  it('module enabled options drain once with a server-owned DRAIN budget under the request cap', async () => {
    const module = RulesMachineModule.register({
      enabled: true,
      drainToken: 'a'.repeat(64),
      sweepToken: 'b'.repeat(64),
      workerDatabaseUrl: 'postgresql://worker@127.0.0.1:1/x',
      sweeperDatabaseUrl: 'postgresql://sweeper@127.0.0.1:1/x',
    })
    expect(module.global).toBe(true)
    const worker = { drain: vi.fn().mockResolvedValue({ state: 'ACKNOWLEDGED' }) }
    const drain = drainFactory(module)(worker) as () => Promise<unknown>
    await drain()
    const invocation = worker.drain.mock.calls[0][0]
    expect(invocation).toMatchObject({ purpose: 'DRAIN', origin: 'SYSTEM', actorId: null })
    expect(invocation.remainingMs()).toBeGreaterThan(15_000)
    expect(invocation.remainingMs()).toBeLessThanOrEqual(17_000)
  })
})
