import 'reflect-metadata'

import { describe, expect, it } from 'vitest'

import { AppModule } from './app.module'

type ModuleRef = { name: string }
type DynamicModule = { module: ModuleRef; providers?: unknown[]; imports?: unknown[] }

// Walks static and dynamic module imports, recording each module's provider classes.
function collectProviders(
  root: ModuleRef,
  owners = new Map<unknown, Set<string>>(),
  seen = new Set<ModuleRef>(),
) {
  if (seen.has(root)) return owners
  seen.add(root)
  const add = (providers: unknown[], name: string) => {
    for (const provider of providers)
      if (typeof provider === 'function')
        owners.set(provider, (owners.get(provider) ?? new Set<string>()).add(name))
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

describe('application module wiring', () => {
  it('registers each provider class in at most one module', () => {
    const duplicates = [...collectProviders(AppModule)]
      .filter(([, modules]) => modules.size > 1)
      .map(([provider, modules]) => `${(provider as ModuleRef).name}: ${[...modules].join(', ')}`)
    expect(duplicates).toEqual([])
  })
})
