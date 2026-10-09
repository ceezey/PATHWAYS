import 'reflect-metadata'

import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { describe, expect, it } from 'vitest'

import { AppModule } from './app.module'
import { RULES_MACHINE_SQL } from './modules/rules/rules-machine-worker'
import { PRIVATE_STORAGE_FACTORIES } from './modules/storage/private-storage-factories'

type ModuleRef = { name: string }
type DynamicModule = { module: ModuleRef; providers?: unknown[]; imports?: unknown[] }

// Nest enhancer tokens may be registered by several modules, each adding one global enhancer.
const enhancerTokens = new Set<unknown>([APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE])

// The registration key of a provider: the class itself or the token of an object provider.
function providerToken(provider: unknown): unknown {
  if (typeof provider === 'function') return provider
  if (provider && typeof provider === 'object' && 'provide' in provider)
    return (provider as { provide: unknown }).provide
  return undefined
}

// Walks static and dynamic module imports, recording each module's provider tokens.
function collectProviders(
  root: ModuleRef,
  owners = new Map<unknown, Set<string>>(),
  seen = new Set<ModuleRef>(),
) {
  if (seen.has(root)) return owners
  seen.add(root)
  const add = (providers: unknown[], name: string) => {
    for (const provider of providers) {
      const token = providerToken(provider)
      if (token !== undefined && !enhancerTokens.has(token))
        owners.set(token, (owners.get(token) ?? new Set<string>()).add(name))
    }
  }
  add(Reflect.getMetadata('providers', root) ?? [], root.name)
  for (const entry of (Reflect.getMetadata('imports', root) ?? []) as unknown[]) {
    if (typeof entry === 'function') collectProviders(entry as ModuleRef, owners, seen)
    else if (entry && typeof entry === 'object' && 'module' in entry) {
      const dynamic = entry as DynamicModule
      collectProviders(dynamic.module, owners, seen)
      add(dynamic.providers ?? [], dynamic.module.name)
      for (const nested of dynamic.imports ?? [])
        collectProviders(nested as ModuleRef, owners, seen)
    }
  }
  return owners
}

// Provider tokens registered by more than one module, as "token: FirstModule, SecondModule".
function duplicateProviders(root: ModuleRef): string[] {
  return [...collectProviders(root)]
    .filter(([, modules]) => modules.size > 1)
    .map(
      ([token, modules]) =>
        `${typeof token === 'function' ? token.name : String(token)}: ${[...modules].join(', ')}`,
    )
}

describe('application module wiring', () => {
  it('registers each provider token in at most one module', () => {
    const owners = collectProviders(AppModule)
    expect(owners.has(RULES_MACHINE_SQL)).toBe(true)
    expect([...(owners.get(PRIVATE_STORAGE_FACTORIES) ?? [])]).toEqual(['StorageModule'])
    expect(duplicateProviders(AppModule)).toEqual([])
  })

  it('flags an object provider token registered in two modules but not repeated enhancers', () => {
    const TOKEN = Symbol('TOKEN')
    class FirstModule {}
    class SecondModule {}
    class RootModule {}
    Module({
      providers: [
        { provide: TOKEN, useValue: 1 },
        { provide: APP_GUARD, useValue: {} },
      ],
    })(FirstModule)
    Module({
      providers: [
        { provide: TOKEN, useFactory: () => 2 },
        { provide: APP_GUARD, useValue: {} },
      ],
    })(SecondModule)
    Module({ imports: [FirstModule, SecondModule] })(RootModule)
    expect(duplicateProviders(RootModule)).toEqual(['Symbol(TOKEN): FirstModule, SecondModule'])
  })
})
