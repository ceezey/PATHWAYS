import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const pillars = [
  'Functional Suitability',
  'Performance Efficiency',
  'Compatibility',
  'Usability',
  'Reliability',
  'Security',
  'Maintainability',
  'Portability',
]
export const roles = {
  'organization-isolation-checker': {
    pillars: ['Security'],
    globs: [
      'apps/api/src/**/*.service.ts',
      'apps/api/prisma/schema.prisma',
      'infra/supabase/**/*.sql',
      'apps/api/prisma/migrations/**/*.sql',
      'infra/supabase/phase6/*.ps1',
    ],
  },
  'migration-integrity-guardian': {
    pillars: ['Reliability'],
    globs: [
      'apps/api/prisma/migrations/**/*.sql',
      'apps/api/prisma/schema.prisma',
      'apps/api/prisma/history/**',
      'scripts/migrations/**',
      'infra/supabase/**/*.sql',
      'infra/supabase/phase6/*.ps1',
      '.github/workflows/ci.yml',
    ],
  },
  'beneficiary-privacy-guardian': {
    pillars: ['Compatibility', 'Security'],
    globs: [
      'apps/api/src/**/*.controller.ts',
      'apps/web/src/api/**/*.ts',
      '**/schemas/*.zod.ts',
      'apps/web/src/lib/services/**/*.ts',
      'packages/shared/src/validation/**/*.ts',
    ],
  },
  'metadata-import-validator': {
    pillars: ['Functional Suitability'],
    globs: ['packages/imports/src/**/*.ts', 'apps/api/src/modules/imports/**/*.ts'],
  },
  'rule-engine-determinism-checker': {
    pillars: ['Performance Efficiency'],
    globs: [
      'packages/shared/src/monitoring/**/*.ts',
      'apps/api/src/modules/indicators/**/*.ts',
      'apps/api/src/modules/rules/**/*.ts',
      'apps/web/src/features/analytics/rule*.ts',
      'apps/web/src/features/analytics/rule*.tsx',
    ],
  },
  'restraint-guardian': {
    pillars: ['Maintainability'],
    globs: ['**/package.json', 'pnpm-workspace.yaml', '**/tsconfig*.json', 'scripts/sad/**'],
  },
  'design-qa-agent': {
    pillars,
    globs: [
      'apps/api/src/**',
      'apps/web/src/**',
      'packages/**',
      'scripts/sad/**',
      '.github/workflows/ci.yml',
      '.github/workflows/rules-dispatch.yml',
      'infra/supabase/phase6/*.ps1',
    ],
  },
} as const
export type Role = keyof typeof roles
export interface Change {
  path: string
  oldPath?: string
  before: Buffer | null
  after: Buffer | null
  staged?: Buffer | null
}
export interface Evaluation {
  subagent: Role
  status: 'PASS' | 'BLOCKED'
  iso_25010_compliance: string[]
  findings: { file_path: string; implicated_lines: number[]; violation_evidence: string }
  prescribed_remediation: string
}
export interface Report {
  change_digest: string
  required_subagents: Partial<Record<Role, string[]>>
  automation_only: boolean
  subagent_evaluations: Evaluation[]
}
export const normalize = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '')
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export function matches(file: string, glob: string): boolean {
  let pattern = ''
  for (let i = 0; i < glob.length; i++) {
    if (glob.slice(i, i + 3) === '**/') {
      pattern += '(?:[^/]+/)*'
      i += 2
    } else if (glob.slice(i, i + 2) === '**') {
      pattern += '.*'
      i++
    } else if (glob[i] === '*') pattern += '[^/]*'
    else pattern += glob[i].replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${pattern}$`).test(normalize(file))
}
export function routing(changes: Change[]): Report['required_subagents'] {
  const paths = [
    ...new Set(
      changes.flatMap((c) => [normalize(c.path), ...(c.oldPath ? [normalize(c.oldPath)] : [])]),
    ),
  ].sort(order)
  return Object.fromEntries(
    Object.entries(roles).flatMap(([role, rules]) => {
      const targets = paths.filter((file) => rules.globs.some((glob) => matches(file, glob)))
      return targets.length ? [[role, targets]] : []
    }),
  )
}
export function digest(changes: Change[]): string {
  const records = changes
    .map((c) => ({
      path: normalize(c.path),
      oldPath: c.oldPath ? normalize(c.oldPath) : null,
      before: c.before === null ? null : createHash('sha256').update(c.before).digest('hex'),
      after: c.after === null ? null : createHash('sha256').update(c.after).digest('hex'),
      ...(c.staged !== undefined
        ? { staged: c.staged === null ? null : createHash('sha256').update(c.staged).digest('hex') }
        : {}),
    }))
    .sort((a, b) => order(a.path, b.path))
  return createHash('sha256').update(JSON.stringify(records)).digest('hex')
}
function evaluation(
  role: Role,
  file: string,
  status: Evaluation['status'],
  evidence: string,
  remediation: string,
  lines: number[] = [],
): Evaluation {
  return {
    subagent: role,
    status,
    iso_25010_compliance: [...roles[role].pillars],
    findings: { file_path: normalize(file), implicated_lines: lines, violation_evidence: evidence },
    prescribed_remediation: remediation,
  }
}
function invocations(file: string, text: string) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const result: { kind: 'dynamic' | 'raw'; line: number; text: string }[] = []
  const aliases = new Set(['eval', 'Function'])
  const name = (node: ts.Expression): string | undefined => {
    if (ts.isIdentifier(node)) return node.text
    if (ts.isParenthesizedExpression(node)) return name(node.expression)
    if (
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    )
      return name(node.expression)
    if (ts.isPropertyAccessExpression(node)) {
      if (['call', 'apply', 'bind'].includes(node.name.text)) return name(node.expression)
      if (
        ['$queryRawUnsafe', '$executeRawUnsafe'].includes(node.name.text) ||
        ['globalThis', 'window', 'global'].includes(node.expression.getText(source))
      )
        return node.name.text
    }
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      if (['call', 'apply', 'bind'].includes(node.argumentExpression.text))
        return name(node.expression)
      if (
        ['$queryRawUnsafe', '$executeRawUnsafe'].includes(node.argumentExpression.text) ||
        ['globalThis', 'window', 'global'].includes(node.expression.getText(source))
      )
        return node.argumentExpression.text
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'bind'
    )
      return name(node.expression.expression)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken)
      return name(node.right)
    return undefined
  }
  const findAliases = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      aliases.has(name(node.initializer) ?? '')
    )
      aliases.add(node.name.text)
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      aliases.has(name(node.right) ?? '')
    )
      aliases.add(node.left.text)
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ['globalThis', 'window', 'global'].includes(node.initializer.getText(source))
    ) {
      for (const binding of node.name.elements)
        if (
          ts.isIdentifier(binding.name) &&
          aliases.has(binding.propertyName?.getText(source) ?? binding.name.text)
        )
          aliases.add(binding.name.text)
    }
    ts.forEachChild(node, findAliases)
  }
  // Repeat to cover alias declarations independent of their lexical order.
  let size = 0
  while (size !== aliases.size) {
    size = aliases.size
    findAliases(source)
  }
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const called = name(node.expression)
      const kind =
        called && aliases.has(called)
          ? 'dynamic'
          : called === '$queryRawUnsafe' || called === '$executeRawUnsafe'
            ? 'raw'
            : null
      if (kind)
        result.push({
          kind,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          text: node.getText(source),
        })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}
// Developer-approved, unapplied transition only. Authority:
// docs/cr-pathways-self-managed-rollout-scenarios.md, 2026-09-27.
// This exact exception does not establish application or runtime safety.
export function approvedUnappliedTransition(
  file: string,
  oldFile: string,
  beforeSha256: string | null,
  afterSha256: string | null,
): boolean {
  const target = 'apps/api/prisma/migrations/0031_f10_f11_rules_runtime/migration.sql'
  return (
    file === target &&
    oldFile === target &&
    beforeSha256 === '210f0f52abdf273c134e4aa66423dd1c5cbce5a3d61e4ad711c73f2a5fd34551' &&
    afterSha256 === '2ad17c0810939c8f392f4a35062643ad692c423517ff124b8bea0dbaae5e6375'
  )
}

export function analyze(changes: Change[]): Report {
  const required = routing(changes)
  const evaluations: Evaluation[] = []
  const inspected = changes.flatMap((c) =>
    c.staged === undefined ? [c] : [c, { ...c, after: c.staged }],
  )
  for (const change of inspected) {
    const file = normalize(change.path)
    const text = change.after?.toString('utf8') ?? ''
    const prior = change.before?.toString('utf8') ?? ''
    const oldFile = normalize(change.oldPath ?? file)
    const immutable = (p: string) =>
      p.startsWith('apps/api/prisma/history/') || matches(p, 'apps/api/prisma/migrations/**/*.sql')
    const approved = approvedUnappliedTransition(
      file,
      oldFile,
      change.before === null ? null : createHash('sha256').update(change.before).digest('hex'),
      change.after === null ? null : createHash('sha256').update(change.after).digest('hex'),
    )
    if (
      ((immutable(oldFile) && change.before !== null) ||
        file.startsWith('apps/api/prisma/history/')) &&
      !approved
    )
      evaluations.push(
        evaluation(
          'migration-integrity-guardian',
          file,
          'BLOCKED',
          'Preserved migration/history content or location changed.',
          'Preserve existing migration bytes and history; use an approved forward migration. Consolidation requires separately approved review.',
        ),
      )
    if (approved)
      evaluations.push(
        evaluation(
          'migration-integrity-guardian',
          file,
          'PASS',
          'REVIEW REQUIRED: exact developer-approved unapplied 0031 transition; semantic migration and role-security review remains mandatory.',
          'Verify registered Change Record, unchanged applied history, role-profile negatives and replay/recovery before final sign-off.',
        ),
      )
    if (/\.[cm]?[jt]sx?$/.test(file) && change.after !== null) {
      const previous = invocations(file, prior).map((item) => item.text)
      for (const item of invocations(file, text)) {
        const index = previous.indexOf(item.text)
        if (index >= 0) {
          previous.splice(index, 1)
          continue
        }
        const role: Role =
          item.kind === 'raw' && required['organization-isolation-checker']?.includes(file)
            ? 'organization-isolation-checker'
            : 'design-qa-agent'
        evaluations.push(
          evaluation(
            role,
            file,
            item.kind === 'dynamic' ? 'BLOCKED' : 'PASS',
            item.kind === 'dynamic'
              ? 'New executable eval/Function invocation detected.'
              : 'REVIEW REQUIRED: unsafe raw API invocation; parameterization and tenant scope require semantic evidence.',
            item.kind === 'dynamic'
              ? 'Replace executable expressions with typed, predefined operations.'
              : 'Prefer tagged parameterized queries; prove values, identifiers and tenant predicates are safe.',
            [item.line],
          ),
        )
      }
    }
    if (file.endsWith('.sql') && change.after !== null) {
      const sql = text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, (match) =>
        match.replace(/[^\n]/g, ' '),
      )
      const destructive =
        /\b(?:DROP\s+(?:TABLE|COLUMN)|ALTER\s+(?:COLUMN\s+)?\w+\s+(?:SET\s+DATA\s+)?TYPE)\b/gi
      for (const item of sql.matchAll(destructive))
        evaluations.push(
          evaluation(
            'migration-integrity-guardian',
            file,
            'PASS',
            'REVIEW REQUIRED: potentially destructive SQL. Token matching does not establish executable behavior or preservation safety.',
            'Review SQL statements and require explicit authorization, preservation routine and tested recovery for destructive changes.',
            [sql.slice(0, item.index).split('\n').length],
          ),
        )
    }
    if (file.endsWith('package.json') && change.after !== null) {
      const current = JSON.parse(text)
      const previous = prior ? JSON.parse(prior) : {}
      for (const section of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ]) {
        for (const dependency of Object.keys(current[section] ?? {}).sort(order)) {
          if (
            (!(dependency in (previous[section] ?? {})) ||
              String(previous[section][dependency]).startsWith('workspace:')) &&
            !String(current[section][dependency]).startsWith('workspace:')
          )
            evaluations.push(
              evaluation(
                'restraint-guardian',
                file,
                'PASS',
                `REVIEW REQUIRED: dependency added: ${dependency} (${section}).`,
                'Explain why native capabilities and installed dependencies cannot satisfy the requirement.',
              ),
            )
        }
      }
    }
  }
  evaluations.sort(
    (a, b) =>
      order(a.subagent, b.subagent) ||
      order(a.findings.file_path, b.findings.file_path) ||
      (a.findings.implicated_lines[0] ?? 0) - (b.findings.implicated_lines[0] ?? 0) ||
      order(a.findings.violation_evidence, b.findings.violation_evidence),
  )
  const seen = new Set<string>()
  return {
    change_digest: digest(changes),
    required_subagents: required,
    automation_only: true,
    subagent_evaluations: evaluations.filter((entry) => {
      const key = JSON.stringify(entry)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  }
}
export function signoff(report: Report, evidence: unknown): Report {
  const failure = (message: string) => ({
    ...report,
    automation_only: false,
    subagent_evaluations: [
      ...report.subagent_evaluations,
      evaluation(
        'design-qa-agent',
        'scripts/sad/check.ts',
        'BLOCKED',
        message,
        'Supply complete external review evidence for the current digest and every routed file and pillar.',
      ),
    ],
  })
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence))
    return failure('Review evidence must be an object.')
  const value = evidence as Record<string, unknown>
  if (value.change_digest !== report.change_digest)
    return failure('Missing or stale change_digest.')
  if (!Array.isArray(value.subagent_evaluations))
    return failure('Missing subagent_evaluations array.')
  const accepted: Evaluation[] = []
  for (const entry of value.subagent_evaluations) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      return failure('Malformed evaluation.')
    const e = entry as Evaluation
    if (
      !Object.hasOwn(roles, e.subagent) ||
      !report.required_subagents[e.subagent] ||
      !['PASS', 'BLOCKED'].includes(e.status) ||
      !Array.isArray(e.iso_25010_compliance) ||
      !e.iso_25010_compliance.every((p) => typeof p === 'string') ||
      !e.findings ||
      typeof e.findings.file_path !== 'string' ||
      !Array.isArray(e.findings.implicated_lines) ||
      !e.findings.implicated_lines.every((line) => Number.isInteger(line) && line > 0) ||
      typeof e.findings.violation_evidence !== 'string' ||
      !e.findings.violation_evidence.trim() ||
      typeof e.prescribed_remediation !== 'string'
    )
      return failure('Malformed or unmatched specialist evaluation.')
    if (
      !report.required_subagents[e.subagent]?.includes(e.findings.file_path) ||
      !roles[e.subagent].pillars.every((p) => e.iso_25010_compliance.includes(p))
    )
      return failure('Review file or ISO pillar coverage does not match routing.')
    accepted.push(e)
  }
  for (const [role, files] of Object.entries(report.required_subagents)) {
    for (const file of files)
      if (!accepted.some((e) => e.subagent === role && e.findings.file_path === file))
        return failure(`Missing ${role} evidence for ${file}.`)
  }
  accepted.sort(
    (a, b) => order(a.subagent, b.subagent) || order(a.findings.file_path, b.findings.file_path),
  )
  return {
    ...report,
    automation_only: false,
    subagent_evaluations: [
      ...report.subagent_evaluations.filter((e) => e.status === 'BLOCKED'),
      ...accepted,
    ],
  }
}
export function parseNameStatus(output: string): { path: string; oldPath?: string }[] {
  const tokens = output.split('\0')
  const result: { path: string; oldPath?: string }[] = []
  for (let i = 0; tokens[i]; ) {
    const status = tokens[i++]
    const first = tokens[i++]
    if (!first) throw new Error('Malformed git name-status output')
    if (/^[RC]/.test(status)) {
      const next = tokens[i++]
      if (!next) throw new Error('Missing rename destination')
      result.push({ oldPath: normalize(first), path: normalize(next) })
    } else result.push({ path: normalize(first) })
  }
  return result
}
export function collect(root: string, base?: string, head?: string): Change[] {
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
      stdio: 'pipe',
    })
  const revision = (ref: string) =>
    git(['rev-parse', '--verify', `${ref}^{tree}`])
      .toString()
      .trim()
  if (head && !base) throw new Error('--head requires --base')
  const from = revision(base ?? 'HEAD')
  const to = head ? revision(head) : undefined
  const changes = parseNameStatus(
    git([
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      from,
      ...(to ? [to] : []),
      '--',
    ]).toString('utf8'),
  )
  if (!to) {
    changes.push(
      ...parseNameStatus(
        git(['diff', '--cached', '--name-status', '-z', '--find-renames', from, '--']).toString(
          'utf8',
        ),
      ),
    )
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
    changes.push(...untracked.map((file) => ({ path: normalize(file) })))
  }
  // Literal-pathspec plumbing: `<ref>:<path>` revision syntax misreads dot, bracket and glob paths.
  const blob = (ref: string, file: string): Buffer | null => {
    const listing = ref
      ? git(['--literal-pathspecs', 'ls-tree', '-z', ref, '--', file])
      : git(['--literal-pathspecs', 'ls-files', '-s', '-z', '--', file])
    const entries = listing
      .toString('utf8')
      .split('\0')
      .map((record) =>
        ref
          ? /^\d+ blob ([0-9a-f]+)()\t(.*)$/s.exec(record)
          : /^\d+ ([0-9a-f]+) (\d)\t(.*)$/s.exec(record),
      )
      .filter((m): m is RegExpExecArray => m !== null && normalize(m[3]) === normalize(file))
    if (entries.some((m) => m[2] !== '' && m[2] !== '0'))
      throw new Error(`Unmerged index entry; resolve conflicts before SAD review: ${file}`)
    return entries.length ? git(['cat-file', 'blob', entries[0][1]]) : null
  }
  const unique = new Map<string, { path: string; oldPath?: string }>()
  for (const change of changes) if (!unique.has(change.path)) unique.set(change.path, change)
  return [...unique.values()]
    .sort((a, b) => order(a.path, b.path))
    .map((change) => {
      const absolute = path.resolve(root, change.path)
      if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`))
        throw new Error('Changed path escapes repository')
      if (!to && fs.existsSync(absolute) && !fs.lstatSync(absolute).isFile())
        throw new Error('Review requires regular files; symlinks are not followed')
      const before = blob(from, change.oldPath ?? change.path)
      const after = to
        ? blob(to, change.path)
        : fs.existsSync(absolute)
          ? fs.readFileSync(absolute)
          : null
      const staged = to ? undefined : blob('', change.path)
      const equal = (a: Buffer | null, b: Buffer | null) =>
        a === null ? b === null : b !== null && a.equals(b)
      const differingIndex = staged !== undefined && !equal(staged, before) && !equal(staged, after)
      return {
        ...change,
        before,
        after,
        ...(differingIndex ? { staged } : {}),
      }
    })
}
export function externalPath(root: string, input: string): string {
  const destination = path.resolve(input)
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink())
    throw new Error('External report/evidence destination must not be a symlink')
  let existing = destination
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) throw new Error('No existing report parent')
    existing = parent
  }
  const real = path.resolve(fs.realpathSync(existing), path.relative(existing, destination))
  const realRoot = fs.realpathSync(root)
  const relative = path.relative(realRoot, real)
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) {
    // Ignored disposable paths are allowed, but tracked files never are.
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    })
      .split('\0')
      .filter(Boolean)
      .map((file) => path.resolve(realRoot, file))
    if (tracked.includes(real))
      throw new Error('Reports and evidence must not overwrite tracked files')
    try {
      execFileSync('git', ['check-ignore', '--quiet', '--', normalize(relative)], {
        cwd: root,
        windowsHide: true,
      })
    } catch {
      throw new Error('Reports and evidence require an external or Git-ignored disposable path')
    }
  }
  return real
}
export function main(args = process.argv.slice(2)): number {
  const options: Record<string, string> = {}
  let final = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') continue
    if (args[i] === '--signoff') {
      final = true
      continue
    }
    if (
      !['--base', '--head', '--reviews', '--output'].includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    )
      throw new Error(`Invalid argument: ${args[i]}`)
    options[args[i].slice(2)] = args[++i]
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim()
  let report = analyze(collect(root, options.base, options.head))
  if (final) {
    let evidence: unknown = null
    if (options.reviews) {
      const location = externalPath(root, options.reviews)
      try {
        evidence = JSON.parse(fs.readFileSync(location, 'utf8'))
      } catch {
        evidence = null
      }
    }
    report = signoff(report, evidence)
  } else if (options.reviews) throw new Error('--reviews requires sad:signoff')
  if (options.output) {
    const output = externalPath(root, options.output)
    if (options.reviews && output === externalPath(root, options.reviews))
      throw new Error('Output must not overwrite input evidence')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  }
  process.stdout.write(
    `${JSON.stringify({ subagent_evaluations: report.subagent_evaluations }, null, 2)}\n`,
  )
  return report.subagent_evaluations.some((e) => e.status === 'BLOCKED') ? 1 : 0
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ subagent_evaluations: [evaluation('design-qa-agent', 'scripts/sad/check.ts', 'BLOCKED', error instanceof Error ? error.message : 'Checker failed', 'Correct checker arguments or repository/evidence inputs and rerun.')] }, null, 2)}\n`,
    )
    process.exitCode = 1
  }
}
