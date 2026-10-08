import 'reflect-metadata'

import { describe, expect, it } from 'vitest'

import { AppModule } from './app.module'

type ModuleRef = { name: string }

// Walks static and dynamic module imports reachable from the root module.
function reachableModules(root: ModuleRef, seen = new Set<ModuleRef>()): Set<ModuleRef> {
  if (seen.has(root)) return seen
  seen.add(root)
  const imports: unknown[] = Reflect.getMetadata('imports', root) ?? []
  for (const entry of imports) {
    if (typeof entry === 'function') reachableModules(entry as ModuleRef, seen)
    else if (entry && typeof entry === 'object' && 'module' in entry)
      reachableModules((entry as { module: ModuleRef }).module, seen)
  }
  return seen
}

describe('application module wiring', () => {
  it('registers each provider class in exactly one module', () => {
    const owners = new Map<unknown, string[]>()
    for (const module of reachableModules(AppModule)) {
      const providers: unknown[] = Reflect.getMetadata('providers', module) ?? []
      for (const provider of providers) {
        if (typeof provider !== 'function') continue
        owners.set(provider, [...(owners.get(provider) ?? []), module.name])
      }
    }
    const duplicates = [...owners]
      .filter(([, modules]) => modules.length > 1)
      .map(([provider, modules]) => `${(provider as ModuleRef).name}: ${modules.join(', ')}`)
    expect(duplicates).toEqual([])
  })
})
