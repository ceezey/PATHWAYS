import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { extractGuards, validateArguments } from './hosted-role-profile-rehearsal.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../..')
const baseline = 'eef965169d6bd5f5428cb9f61dca13ce98afff7c'
const migration = 'apps/api/prisma/migrations/0031_f10_f11_rules_runtime/migration.sql'
const canonical = fs.readFileSync(path.join(root, migration), 'utf8')
const normalize = (text) => text.replaceAll('\r\n', '\n')

test('local rehearsal refuses missing authorization, extra arguments and ambient targets', () => {
  for (const args of [
    [],
    ['--run-hosted'],
    ['--authorization=anything', '--postgres-bin=C:/fake'],
    ['--authorization=PATHWAYS_OWNED_LOCAL_HOSTED_ROLE_PROFILE_ONLY', '--postgres-bin=relative'],
    [
      '--authorization=PATHWAYS_OWNED_LOCAL_HOSTED_ROLE_PROFILE_ONLY',
      '--postgres-bin=C:/fake',
      '--port=5432',
    ],
  ]) {
    assert.throws(() => validateArguments(args))
  }
})

test('the migration delta is restricted to the approved installation and readiness bodies', () => {
  const original = execFileSync('git', ['show', `${baseline}:${migration}`], {
    cwd: root,
    encoding: 'utf8',
  })
  function mask(sql) {
    return normalize(sql)
      .replace(/DO \$\$ DECLARE role_name text;existing record;[\s\S]*?END \$\$;/, '<installation>')
      .replace(
        /(CREATE FUNCTION pathways_rules_internal\.assert_runtime_provisioned\(\)[\s\S]*?AS \$\$)\n[\s\S]*?END \$\$;/,
        '$1<readiness>',
      )
  }
  assert.equal(mask(canonical), mask(original))
})

test('hosted cleanup uses the exact canonical post-install readiness predicate', () => {
  const { readiness, installation } = extractGuards(normalize(canonical))
  const cleanup = fs.readFileSync(path.join(directory, 'hosted-rules-cleanup.sql'), 'utf8')
  const provision = fs.readFileSync(path.join(directory, 'hosted-rules-preprovision.sql'), 'utf8')
  assert.ok(cleanup.endsWith(`DO $$ ${readiness} $$;\n`))
  assert.ok(provision.includes(`DO $$ ${installation} $$;`))
  assert.ok(
    cleanup.indexOf('REVOKE ALL ON SCHEMA pathways_rules_internal FROM prisma') <
      cleanup.indexOf('FROM prisma GRANTED BY postgres RESTRICT'),
  )
  assert.ok(cleanup.indexOf('COMMIT;') < cleanup.indexOf(`DO $$ ${readiness} $$;`))
})

test('all applied baseline, archive and0027/0028 source bytes remain preserved', () => {
  const tracked = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', baseline, '--', 'apps/api/prisma'],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  const files = tracked.filter(
    (file) => /prisma\/history\//.test(file) || /migrations\/(0000_|0027_|0028_)/.test(file),
  )
  assert.equal(files.length, 6)
  for (const file of files) {
    const original = execFileSync('git', ['show', `${baseline}:${file}`], {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    })
    assert.deepEqual(
      fs.readFileSync(path.join(root, file)),
      original,
      `Applied history changed: ${file}`,
    )
  }
})

test('three-owner exact role and context helper guards bind provisioning and both cleanup outcomes', () => {
  const core = normalize(
    fs.readFileSync(
      path.join(root, 'apps/api/prisma/migrations/0034_core_feature_completion/migration.sql'),
      'utf8',
    ),
  )
  const installation = core.match(
    /DO \$\$ (DECLARE role_name text;existing record;[\s\S]*?)END \$\$;/,
  )?.[1]
  const readiness = core.match(
    /CREATE FUNCTION pathways\.p34_assert_projection_provisioned\(\)[\s\S]*?AS \$\$\n([\s\S]*?)END \$\$;/,
  )?.[1]
  const installCheck = core.match(
    /DO \$context_install\$ BEGIN\n([\s\S]*?)\nEND \$context_install\$;/,
  )?.[1]
  assert.ok(installation && readiness && installCheck)
  const fragmentStart = readiness.indexOf('<<p34_context_helper_acl>>')
  assert.ok(fragmentStart > 0, 'Canonical context fragment must be explicit')
  const roleReadiness = readiness.slice(0, fragmentStart)
  const finalAcl = readiness.slice(fragmentStart).trimEnd()
  assert.equal(
    installCheck,
    finalAcl,
    'Canonical installation and readiness helper predicates differ',
  )
  const originalAcl = finalAcl
    .replace(
      "'postgres','pathways_runtime','report_projection_owner','finance_operation_owner'",
      "'postgres','pathways_runtime'",
    )
    .replace('cardinality(ctx_expected)<>4', 'cardinality(ctx_expected)<>2')
  assert.notEqual(originalAcl, finalAcl)
  for (const body of [originalAcl, finalAcl]) {
    assert.ok(body.includes('ctx_fn.proretset OR ctx_fn.prokind'))
    assert.ok(body.includes('array_agg(a.grantee ORDER BY a.grantee)'))
    assert.ok(body.includes('IS DISTINCT FROM ctx_expected'))
    assert.ok(body.includes('a.grantor<>ctx_owner'))
    assert.ok(body.includes("a.privilege_type<>'EXECUTE' OR a.is_grantable"))
    assert.ok(body.includes('2d76aa3b324899355b56837213df25a0'))
    assert.ok(body.includes('f27cc6e4905d203b147f022435e6cb61'))
  }
  const expected =
    "ARRAY['public_projection_owner','report_projection_owner','finance_operation_owner']"
  assert.ok(installation.includes(`FOREACH role_name IN ARRAY ${expected}`))
  assert.ok(roleReadiness.includes(`FOREACH role_name IN ARRAY ${expected}`))
  const grant =
    'GRANT EXECUTE ON FUNCTION pathways.runtime_context_organization(),pathways.runtime_context_user() TO report_projection_owner,finance_operation_owner;'
  for (const profile of ['hosted', 'forward']) {
    const provision = normalize(
      fs.readFileSync(path.join(directory, `${profile}-core-preprovision.sql`), 'utf8'),
    )
    const cleanup = normalize(
      fs.readFileSync(path.join(directory, `${profile}-core-cleanup.sql`), 'utf8'),
    )
    assert.ok(provision.includes(`DO $$ ${installation}END $$;`))
    assert.ok(provision.includes(originalAcl))
    assert.ok(provision.includes(finalAcl))
    assert.equal(provision.split(grant).length, 2)
    assert.ok(provision.indexOf(originalAcl) < provision.indexOf(grant))
    assert.ok(provision.indexOf(grant) < provision.indexOf(finalAcl))
    assert.ok(cleanup.includes(`DO $$ ${roleReadiness}END $$;`))
    assert.ok(cleanup.includes(finalAcl))
    assert.ok(cleanup.includes(originalAcl))
    assert.ok(
      cleanup.includes(
        "IF NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0034_core_feature_completion' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN",
      ),
    )
    assert.ok(
      cleanup.includes(
        'REVOKE EXECUTE ON FUNCTION pathways.runtime_context_organization(),pathways.runtime_context_user() FROM report_projection_owner,finance_operation_owner RESTRICT;',
      ),
    )
    assert.ok(
      provision.includes(
        "migration_name='0034_core_feature_completion' AND finished_at IS NOT NULL",
      ),
    )
    assert.ok(
      provision.includes(
        'rolcanlogin AND rolinherit AND NOT rolsuper AND NOT rolcreaterole AND NOT rolreplication',
      ),
    )
    assert.ok(
      cleanup.indexOf('REVOKE CREATE ON SCHEMA pathways') <
        cleanup.indexOf('FROM prisma GRANTED BY postgres RESTRICT'),
    )
    assert.ok(cleanup.indexOf('COMMIT;') < cleanup.indexOf(`DO $$ ${roleReadiness}`))
    assert.ok(cleanup.indexOf('COMMIT;') < cleanup.indexOf('DO $context_verify$'))
    assert.ok(!/GRANT[^;]+ON DATABASE/.test(provision))
    assert.ok(!/GRANT EXECUTE[^;]+WITH GRANT OPTION/.test(provision))
    assert.ok(!/GRANT EXECUTE[^;]+TO prisma/.test(provision))
  }
})
