import { describe, expect, it } from 'vitest'
import { AUDIT_MODULES, auditModuleOf, auditQuerySchema } from './audit-log'

describe('audit log contract', () => {
  it('puts every entity type in exactly one uniquely labelled module, ending with other', () => {
    const all = AUDIT_MODULES.flatMap((m) => [...m.entityTypes])
    expect(new Set(all).size).toBe(all.length)
    expect(new Set(AUDIT_MODULES.map((m) => m.label)).size).toBe(AUDIT_MODULES.length)
    expect(AUDIT_MODULES.at(-1)).toEqual({ key: 'other', label: 'Other', entityTypes: [] })
  })

  it('maps entity types to readable modules and falls back to other', () => {
    expect(auditModuleOf('Project')).toEqual({ key: 'projects', label: 'Projects' })
    expect(auditModuleOf('ProjectActivity')).toEqual({ key: 'activities', label: 'Activities' })
    expect(auditModuleOf('Authentication')).toEqual({ key: 'users', label: 'Users and sign-in' })
    expect(auditModuleOf('LegacyThing')).toEqual({ key: 'other', label: 'Other' })
  })

  it('parses the server filters and trims the keyword', () => {
    expect(
      auditQuerySchema.parse({
        module: 'projects',
        from: '2026-09-28',
        to: '2026-09-28',
        q: '  PROJECT  ',
      }),
    ).toEqual({ module: 'projects', from: '2026-09-28', to: '2026-09-28', q: 'PROJECT', limit: 50 })
    expect(
      auditQuerySchema.parse({
        cursor: '2026-09-27T00:00:00.123Z|40000000-0000-4000-8000-000000000001',
      }).limit,
    ).toBe(50)
  })

  it('rejects bad filters', () => {
    for (const bad of [
      { module: 'Project' },
      { from: '2026-09-29', to: '2026-09-28' },
      { from: '2026-02-30' },
      { to: '28/09/2026' },
      { q: '   ' },
      { q: 'x'.repeat(101) },
      { entityType: 'Project' },
      { limit: 101 },
    ])
      expect(auditQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })
})
