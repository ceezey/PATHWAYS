import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type Change,
  analyze,
  approvedUnappliedTransition,
  collect,
  digest,
  externalPath,
  matches,
  parseNameStatus,
  roles,
  routing,
  signoff,
} from './check'

const change = (file: string, after: string | null, before: string | null = null): Change => ({
  path: file,
  before: before === null ? null : Buffer.from(before),
  after: after === null ? null : Buffer.from(after),
})
const approved = (report: ReturnType<typeof analyze>) => ({
  change_digest: report.change_digest,
  subagent_evaluations: Object.entries(report.required_subagents).flatMap(([role, files]) =>
    files.map((file) => ({
      subagent: role,
      status: 'PASS',
      iso_25010_compliance: [...roles[role as keyof typeof roles].pillars],
      findings: {
        file_path: file,
        implicated_lines: [],
        violation_evidence: 'Reviewed file, affected callers, scope and tests.',
      },
      prescribed_remediation: '',
    })),
  ),
})
const blocked = (report: ReturnType<typeof analyze>) =>
  report.subagent_evaluations.some((e) => e.status === 'BLOCKED')
const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('routing and digest', () => {
  it('matches zero or multiple glob directories and Windows paths', () => {
    expect(matches('package.json', '**/package.json')).toBe(true)
    expect(matches('apps\\api\\src\\a.service.ts', 'apps/api/src/**/*.service.ts')).toBe(true)
    expect(matches('apps/api/src/a/b.service.ts', 'apps/api/src/**/*.service.ts')).toBe(true)
    expect(matches('apps/api/src/a.service.ts.extra', 'apps/api/src/**/*.service.ts')).toBe(false)
  })
  it('routes old and new rename paths and deletions', () => {
    const renamed = {
      ...change('elsewhere/a.ts', 'ok', 'old'),
      oldPath: 'apps/api/src/a.service.ts',
    }
    expect(routing([renamed])['organization-isolation-checker']).toEqual([
      'apps/api/src/a.service.ts',
    ])
    expect(
      routing([change('packages/imports/src/a.ts', null, 'old')])['metadata-import-validator'],
    ).toEqual(['packages/imports/src/a.ts'])
    expect(routing([change('docs/sad-pathways.md', 'text')])).toEqual({})
  })
  it('binds final, base, rename and deletion bytes independent of input order', () => {
    const a = change('a.ts', 'new', 'old')
    const b = change('b.ts', null, 'old')
    expect(digest([a, b])).toBe(digest([b, a]))
    expect(digest([a])).not.toBe(digest([{ ...a, oldPath: 'old.ts' }]))
    expect(digest([a])).not.toBe(digest([change('a.ts', 'new', 'other')]))
    expect(digest([a])).not.toBe(digest([change('a.ts', 'other', 'old')]))
  })
  it('parses NUL paths including spaces and newlines', () => {
    expect(parseNameStatus('R100\0old a.ts\0new\na.ts\0D\0gone.ts\0')).toEqual([
      { oldPath: 'old a.ts', path: 'new\na.ts' },
      { path: 'gone.ts' },
    ])
  })
})
describe('automated diagnostics', () => {
  const unappliedPath = 'apps/api/prisma/migrations/0031_f10_f11_rules_runtime/migration.sql'
  const approvedBefore = '210f0f52abdf273c134e4aa66423dd1c5cbce5a3d61e4ad711c73f2a5fd34551'
  const approvedAfter = '2ad17c0810939c8f392f4a35062643ad692c423517ff124b8bea0dbaae5e6375'
  it('admits only the exact approved unapplied migration byte transition', () => {
    expect(
      approvedUnappliedTransition(unappliedPath, unappliedPath, approvedBefore, approvedAfter),
    ).toBe(true)
  })
  it.each([
    [unappliedPath, unappliedPath, null, approvedAfter],
    [unappliedPath, unappliedPath, approvedBefore, null],
    [unappliedPath, unappliedPath, 'different', approvedAfter],
    [unappliedPath, unappliedPath, approvedBefore, 'different'],
    [unappliedPath, 'apps/api/prisma/history/0031.sql', approvedBefore, approvedAfter],
    [
      'apps/api/prisma/migrations/0031_other/migration.sql',
      unappliedPath,
      approvedBefore,
      approvedAfter,
    ],
    [
      unappliedPath,
      'apps/api/prisma/migrations/0031_other/migration.sql',
      approvedBefore,
      approvedAfter,
    ],
  ])('rejects unauthorized migration transition %j', (file, oldFile, before, after) => {
    expect(approvedUnappliedTransition(file as string, oldFile as string, before, after)).toBe(
      false,
    )
  })
  it('does not exempt arbitrary SQL at the approved path or differing staged bytes', () => {
    const report = analyze([
      { ...change(unappliedPath, 'new', 'old'), staged: Buffer.from('staged mutation') },
    ])
    expect(blocked(report)).toBe(true)
    expect(report.required_subagents['migration-integrity-guardian']).toContain(unappliedPath)
    expect(
      signoff(report, approved(report)).subagent_evaluations.some(
        (entry) => entry.status === 'BLOCKED',
      ),
    ).toBe(true)
  })
  it('ignores strings, comments, declarations and unchanged execution', () => {
    expect(
      blocked(
        analyze([
          change(
            'packages/shared/a.ts',
            '// eval(x)\nconst text="new Function(x)"; function hello() {}',
          ),
        ]),
      ),
    ).toBe(false)
    expect(
      blocked(analyze([change('packages/shared/a.ts', 'eval(x);\nconst y=1', 'eval(x);')])),
    ).toBe(false)
  })
  it.each([
    'eval(code)',
    'new Function(code)',
    'Function(code)',
    '(0, eval)(code)',
    'globalThis["eval"](code)',
    'const run=eval; run(code)',
    'eval.call(null,code)',
    'eval.apply(null,[code])',
    'const run=eval.bind(null);run(code)',
    'let run;run=eval;run(code)',
    'const {eval:run}=globalThis;run(code)',
    '(eval as any)(code)',
    'eval!(code)',
    '(<any>eval)(code)',
    '(eval satisfies Function)(code)',
  ])('blocks executable expressions: %s', (code) => {
    expect(blocked(analyze([change('packages/shared/a.ts', code)]))).toBe(true)
  })
  it('requires raw-query review without falsely proving a violation', () => {
    const report = analyze([
      change('apps/api/src/a.service.ts', 'db.$queryRawUnsafe("SELECT * FROM a WHERE id=$1", id)'),
    ])
    expect(blocked(report)).toBe(false)
    expect(report.subagent_evaluations[0].findings.violation_evidence).toContain('REVIEW REQUIRED')
  })
  it('flags destructive SQL but excludes comments', () => {
    const report = analyze([
      change(
        'infra/supabase/new.sql',
        '-- DROP TABLE a;\n/* DROP COLUMN a; */\nALTER TABLE a DROP COLUMN b;',
      ),
    ])
    expect(report.subagent_evaluations).toHaveLength(1)
    expect(report.subagent_evaluations[0].findings.implicated_lines).toEqual([3])
    expect(report.required_subagents['migration-integrity-guardian']).toEqual([
      'infra/supabase/new.sql',
    ])
  })
  it('blocks historical SQL edits and deletion but permits forward additions', () => {
    expect(
      blocked(
        analyze([
          change('apps/api/prisma/migrations/0027_revised_csv_rbac/migration.sql', 'new', 'old'),
        ]),
      ),
    ).toBe(true)
    expect(
      blocked(analyze([change('apps/api/prisma/history/through-0026.zip', null, 'old')])),
    ).toBe(true)
    expect(
      blocked(
        analyze([
          change('apps/api/prisma/migrations/0029_new/migration.sql', 'CREATE TABLE a(id uuid);'),
        ]),
      ),
    ).toBe(false)
  })
  it('flags external additions, excluding existing and workspace dependencies', () => {
    const report = analyze([
      change(
        'package.json',
        '{"dependencies":{"old":"2","new":"1","@pathways/shared":"workspace:*"}}',
        '{"dependencies":{"old":"1"}}',
      ),
    ])
    expect(report.subagent_evaluations).toHaveLength(1)
    expect(report.subagent_evaluations[0].findings.violation_evidence).toContain('new')
    expect(
      analyze([
        change(
          'package.json',
          '{"dependencies":{"shared":"1"}}',
          '{"dependencies":{"shared":"workspace:*"}}',
        ),
      ]).subagent_evaluations,
    ).toHaveLength(1)
  })
  it('sorts diagnostics deterministically', () => {
    const a = change('packages/shared/z.ts', 'eval(code)')
    const b = change('packages/shared/a.ts', 'eval(code)')
    expect(analyze([a, b])).toEqual(analyze([b, a]))
  })
})
describe('semantic sign-off', () => {
  const report = analyze([change('apps/api/src/a.service.ts', 'const safe=true')])
  it('accepts complete digest-bound coverage', () => {
    expect(blocked(signoff(report, approved(report)))).toBe(false)
  })
  it.each([
    null,
    {},
    { change_digest: 'stale', subagent_evaluations: [] },
    { change_digest: report.change_digest, subagent_evaluations: [] },
  ])('rejects missing/stale evidence %j', (evidence) => {
    expect(blocked(signoff(report, evidence))).toBe(true)
  })
  it('rejects incomplete pillars, invalid lines, role, path and malformed status', () => {
    for (const field of ['pillars', 'lines', 'role', 'path', 'status', 'evidence']) {
      const evidence = approved(report)
      const e = evidence.subagent_evaluations[0]
      if (field === 'pillars') e.iso_25010_compliance = []
      if (field === 'lines') Object.assign(e.findings, { implicated_lines: [-1] })
      if (field === 'role') e.subagent = 'invented'
      if (field === 'path') e.findings.file_path = 'elsewhere.ts'
      if (field === 'status') e.status = 'SKIPPED'
      if (field === 'evidence') e.findings.violation_evidence = ''
      expect(blocked(signoff(report, evidence))).toBe(true)
    }
  })
  it('preserves semantic and automated blockers', () => {
    const evidence = approved(report)
    evidence.subagent_evaluations[0].status = 'BLOCKED'
    expect(blocked(signoff(report, evidence))).toBe(true)
    const unsafe = analyze([change('packages/shared/a.ts', 'eval(code)')])
    expect(blocked(signoff(unsafe, approved(unsafe)))).toBe(true)
  })
})
describe('git collection', () => {
  it('collects staged, unstaged, untracked, deleted, renamed and revision changes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pathways-sad-test-'))
    temporary.push(root)
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' }).trim()
    git('init', '-q')
    git('config', 'user.email', 'synthetic@example.invalid')
    git('config', 'user.name', 'Synthetic SAD test')
    fs.writeFileSync(path.join(root, 'a.ts'), 'old')
    fs.writeFileSync(path.join(root, 'b.ts'), 'old')
    git('add', '.')
    git('commit', '-qm', 'fixture')
    const base = git('rev-parse', 'HEAD')
    git('mv', 'a.ts', 'renamed.ts')
    fs.writeFileSync(path.join(root, 'b.ts'), 'staged')
    git('add', 'b.ts')
    fs.writeFileSync(path.join(root, 'b.ts'), 'final')
    fs.writeFileSync(path.join(root, 'new.ts'), 'untracked')
    const changes = collect(root)
    expect(changes.find((c) => c.path === 'renamed.ts')?.oldPath).toBe('a.ts')
    expect(changes.find((c) => c.path === 'b.ts')?.after?.toString()).toBe('final')
    expect(changes.find((c) => c.path === 'new.ts')?.before).toBeNull()
    git('add', '.')
    git('commit', '-qm', 'final')
    expect(collect(root, base, 'HEAD')).toEqual(
      changes.map(({ staged: _staged, ...final }) => final),
    )
    fs.unlinkSync(path.join(root, 'b.ts'))
    expect(collect(root).find((c) => c.path === 'b.ts')?.after).toBeNull()
    git('rm', 'b.ts')
    fs.writeFileSync(path.join(root, 'b.ts'), 'recreated')
    expect(collect(root).filter((c) => c.path === 'b.ts')).toHaveLength(1)
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'dot.md'), 'untracked dot path')
    const dot = collect(root).find((c) => c.path === '.claude/dot.md')
    expect(dot?.before).toBeNull()
    expect(dot?.after?.toString()).toBe('untracked dot path')
  })
  it('reads index bytes by literal path and rejects unmerged entries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pathways-sad-test-'))
    temporary.push(root)
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' }).trim()
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'synthetic@example.invalid')
    git('config', 'user.name', 'Synthetic SAD test')
    fs.writeFileSync(path.join(root, 'ab.ts'), 'sibling')
    fs.writeFileSync(path.join(root, 'c.ts'), 'base')
    git('add', '.')
    git('commit', '-qm', 'fixture')
    fs.writeFileSync(path.join(root, 'a[bc].ts'), 'untracked')
    fs.writeFileSync(path.join(root, 'ab.ts'), 'sibling staged')
    git('add', 'ab.ts')
    const changes = collect(root)
    const bracket = changes.find((c) => c.path === 'a[bc].ts')
    expect(bracket?.before).toBeNull()
    expect(bracket?.staged).toBeUndefined()
    expect(bracket?.after?.toString()).toBe('untracked')
    fs.unlinkSync(path.join(root, 'a[bc].ts'))
    git('commit', '-qam', 'sibling')
    git('switch', '-qc', 'other')
    fs.writeFileSync(path.join(root, 'c.ts'), 'other')
    git('commit', '-qam', 'other')
    git('switch', '-q', 'main')
    fs.writeFileSync(path.join(root, 'c.ts'), 'main')
    git('commit', '-qam', 'main')
    expect(() => git('merge', '-q', 'other')).toThrow()
    expect(() => collect(root)).toThrow(/Unmerged index entry/)
  })
  it('reviews staged code even when unstaged content restores HEAD', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pathways-sad-index-'))
    temporary.push(root)
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' }).trim()
    git('init', '-q')
    git('config', 'user.email', 'synthetic@example.invalid')
    git('config', 'user.name', 'Synthetic SAD test')
    fs.mkdirSync(path.join(root, 'packages/shared'), { recursive: true })
    const file = path.join(root, 'packages/shared/a.ts')
    fs.writeFileSync(file, 'const safe=true')
    git('add', '.')
    git('commit', '-qm', 'fixture')
    fs.writeFileSync(file, 'eval(code)')
    git('add', '.')
    fs.writeFileSync(file, 'const safe=true')
    const changes = collect(root)
    expect(changes).toHaveLength(1)
    expect(changes[0].staged?.toString()).toBe('eval(code)')
    expect(blocked(analyze(changes))).toBe(true)
    const first = digest(changes)
    git('add', '.')
    expect(digest(collect(root))).not.toBe(first)
    const tree = git('hash-object', '-t', 'tree', '-w', '--stdin')
    expect(collect(root, tree, 'HEAD')).toHaveLength(1)
  })
  it('allows disposable external/ignored reports and rejects tracked, unignored and symlink destinations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pathways-sad-path-'))
    temporary.push(root)
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' })
    git('init', '-q')
    fs.writeFileSync(path.join(root, '.gitignore'), '.tmp/\n')
    fs.writeFileSync(path.join(root, 'tracked.json'), '{}')
    git('add', '.')
    expect(() => externalPath(root, path.join(root, 'tracked.json'))).toThrow()
    expect(() => externalPath(root, path.join(root, 'new.json'))).toThrow()
    expect(externalPath(root, path.join(root, '.tmp', 'report.json'))).toBe(
      path.join(root, '.tmp', 'report.json'),
    )
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'pathways-sad-external-'))
    temporary.push(external)
    expect(externalPath(root, path.join(external, 'report.json'))).toBe(
      path.join(external, 'report.json'),
    )
    // Windows junctions require no symlink privilege and exercise parent resolution.
    fs.symlinkSync(
      root,
      path.join(external, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    expect(() => externalPath(root, path.join(external, 'link', 'tracked.json'))).toThrow()
  })
})
