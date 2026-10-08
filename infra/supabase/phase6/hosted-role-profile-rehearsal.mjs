import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(directory, '../../..')
const migration = path.join(
  repository,
  'apps/api/prisma/migrations/0031_f10_f11_rules_runtime/migration.sql',
)
const coreMigration = path.join(
  repository,
  'apps/api/prisma/migrations/0034_core_feature_completion/migration.sql',
)
const port = 55452
const authorization = 'PATHWAYS_OWNED_LOCAL_HOSTED_ROLE_PROFILE_ONLY'

export function validateArguments(args) {
  assert.equal(args.length, 2, 'Only explicit authorization and PostgreSQL bin directory accepted')
  assert.equal(args[0], `--authorization=${authorization}`)
  assert.ok(args[1].startsWith('--postgres-bin='))
  const bin = args[1].slice('--postgres-bin='.length)
  assert.ok(path.isAbsolute(bin), 'PostgreSQL bin must be absolute')
  for (const tool of ['initdb', 'pg_ctl', 'psql']) {
    assert.ok(
      fs.statSync(path.join(bin, process.platform === 'win32' ? `${tool}.exe` : tool)).isFile(),
    )
  }
  return fs.realpathSync(bin)
}

export function extractGuards(sql) {
  const installation = sql.match(
    /DO \$\$ (DECLARE role_name text;existing record;[\s\S]*?)END \$\$;/,
  )?.[1]
  const readiness = sql.match(
    /CREATE FUNCTION pathways_rules_internal\.assert_runtime_provisioned\(\)[\s\S]*?AS \$\$\r?\n([\s\S]*?)END \$\$;/,
  )?.[1]
  assert.ok(installation && readiness, 'Canonical guards required')
  return { installation: `${installation}END`, readiness: `${readiness}END` }
}

async function assertPortFree() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

async function rehearse(args) {
  const bin = validateArguments(args)
  await assertPortFree()
  const owned = path.join(repository, '.tmp', `hosted-role-profile-${randomUUID()}`)
  const data = path.join(owned, 'data')
  fs.mkdirSync(owned, { recursive: true })
  const marker = { authorization, owned, data, port, host: '127.0.0.1' }
  fs.writeFileSync(path.join(owned, 'owned.json'), JSON.stringify(marker))
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].includes(key.toUpperCase()),
    ),
  )
  const transcript = path.join(owned, 'commands.log')
  const checks = []
  const inputHashes = Object.fromEntries(
    [
      migration,
      coreMigration,
      ...[
        'hosted-rules-preprovision.sql',
        'hosted-rules-cleanup.sql',
        'hosted-core-preprovision.sql',
        'hosted-core-cleanup.sql',
      ].map((name) => path.join(directory, name)),
    ].map((file) => [
      path.relative(repository, file),
      createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    ]),
  )
  const { installation, readiness } = extractGuards(fs.readFileSync(migration, 'utf8'))
  const featureRoles = installation.match(/FOREACH role_name IN ARRAY (ARRAY\[[^\]]+\])/)?.[1]
  assert.ok(featureRoles)
  const tool = (name) => path.join(bin, process.platform === 'win32' ? `${name}.exe` : name)
  function command(name, argv, input) {
    const redirected = name === 'pg_ctl' && argv.includes('start')
    const handles = redirected
      ? [
          fs.openSync(path.join(owned, 'pgctl-start.stdout.log'), 'a'),
          fs.openSync(path.join(owned, 'pgctl-start.stderr.log'), 'a'),
        ]
      : []
    let result
    try {
      result = spawnSync(tool(name), argv, {
        input,
        encoding: 'utf8',
        env: environment,
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: redirected ? ['ignore', ...handles] : 'pipe',
        windowsHide: true,
      })
    } finally {
      for (const handle of handles) fs.closeSync(handle)
    }
    if (redirected) {
      result.stdout = fs.readFileSync(path.join(owned, 'pgctl-start.stdout.log'), 'utf8')
      result.stderr = fs.readFileSync(path.join(owned, 'pgctl-start.stderr.log'), 'utf8')
    }
    fs.appendFileSync(
      transcript,
      `${name} ${JSON.stringify(argv)}\n${result.stdout ?? ''}${result.stderr ?? ''}\nstatus=${result.status}\n`,
    )
    if (result.error) throw result.error
    return result
  }
  const base = [
    '-X',
    '-q',
    '-A',
    '-t',
    '-h',
    '127.0.0.1',
    '-p',
    String(port),
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
  ]
  function sql(text, user = 'postgres', expected = 0) {
    const result = command('psql', [...base, '-U', user, '-f', '-'], text)
    if (expected === 0) assert.equal(result.status, 0, result.stderr)
    else {
      assert.notEqual(result.status, 0, 'Negative case unexpectedly accepted')
      assert.match(result.stderr, new RegExp(`ERROR:\\s+${expected}:`))
    }
    return result.stdout
  }
  function script(name, original = 'f', expected = 0) {
    const result = command('psql', [
      ...base,
      '-U',
      'postgres',
      '-v',
      'target_project_ref=klbtoqdalmcsfjqophty',
      '-v',
      'expected_database=postgres',
      '-v',
      `original_prisma_database_create=${original}`,
      '-f',
      path.join(directory, name),
    ])
    if (expected === 0) assert.equal(result.status, 0, result.stderr)
    else {
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, new RegExp(`ERROR:\\s+${expected}:`))
    }
  }
  const guard = (body) => `DO $$ ${body} $$;`
  function negative(name, mutation, body = installation, user = 'supabase_admin') {
    sql(
      `BEGIN; ${mutation}; ${guard(body)} ROLLBACK;`,
      user,
      body === installation ? '55000' : '42501',
    )
    checks.push(name)
  }
  let started = false
  let startAttempted = false
  let cleanupVerified = false
  let passed = false
  try {
    assert.equal(
      command('initdb', [
        '-D',
        data,
        '-U',
        'supabase_admin',
        '--auth=trust',
        '--encoding=UTF8',
        '--no-locale',
      ]).status,
      0,
    )
    fs.appendFileSync(
      path.join(data, 'postgresql.conf'),
      `\nlisten_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories=''\n`,
    )
    startAttempted = true
    assert.equal(
      command('pg_ctl', [
        '-D',
        data,
        '-l',
        path.join(owned, 'postgres.log'),
        '-w',
        '-t',
        '30',
        'start',
      ]).status,
      0,
    )
    started = true
    assert.equal(
      sql('SHOW data_directory;', 'supabase_admin').trim().replaceAll('\\', '/'),
      data.replaceAll('\\', '/'),
    )
    sql(
      `CREATE ROLE postgres LOGIN INHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION BYPASSRLS;
CREATE ROLE prisma LOGIN INHERIT NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE ROLE pathways_runtime LOGIN NOINHERIT;
ALTER DATABASE postgres OWNER TO postgres;
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;
GRANT prisma TO postgres WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
CREATE SCHEMA pathways AUTHORIZATION prisma;
GRANT USAGE ON SCHEMA pathways TO pathways_runtime;
GRANT CREATE ON SCHEMA public TO prisma;
CREATE TABLE public._prisma_migrations(migration_name text,finished_at timestamptz,rolled_back_at timestamptz);
INSERT INTO public._prisma_migrations VALUES('0030_core_profile_partners',now(),NULL);
ALTER TABLE public._prisma_migrations OWNER TO prisma;`,
      'supabase_admin',
    )
    const databaseAclSql = `SELECT coalesce(jsonb_agg(jsonb_build_object('owner',d.datdba,'grantor',a.grantor,'grantee',a.grantee,
'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
FROM pg_catalog.pg_database d CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
WHERE d.datname=current_database();`
    const originalDatabaseAcl = sql(databaseAclSql)
    script('hosted-rules-preprovision.sql')
    sql(guard(installation), 'prisma')
    checks.push('real-nonsuperuser-creator-and-exact-installation')
    negative(
      'wrong-temporary-grantor-and-duplicate',
      'GRANT rules_store_owner TO prisma WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY supabase_admin',
    )
    for (const option of ['ADMIN TRUE', 'INHERIT FALSE', 'SET FALSE']) {
      negative(
        `wrong-temporary-${option}`,
        `SET LOCAL ROLE postgres; GRANT rules_store_owner TO prisma WITH ${option} GRANTED BY postgres`,
      )
    }
    negative(
      'wrong-bootstrap-ADMIN FALSE',
      'REVOKE ADMIN OPTION FOR rules_store_owner FROM postgres GRANTED BY supabase_admin CASCADE',
    )
    for (const option of ['INHERIT TRUE', 'SET TRUE']) {
      negative(
        `wrong-bootstrap-${option}`,
        `GRANT rules_store_owner TO postgres WITH ${option} GRANTED BY supabase_admin`,
      )
    }
    negative(
      'missing-owner-bootstrap',
      'REVOKE rules_store_owner FROM postgres GRANTED BY supabase_admin CASCADE',
    )
    negative(
      'missing-machine-bootstrap',
      'REVOKE pathways_rules_worker FROM postgres GRANTED BY supabase_admin',
    )
    negative('outgoing-feature-membership', 'GRANT pathways_runtime TO rules_store_owner')
    negative('direct-application-membership', 'GRANT rules_store_owner TO pathways_runtime')
    negative(
      'transitive-admin-only-application-membership',
      'GRANT prisma TO pathways_runtime WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',
    )
    negative('lingering-prisma-readiness', 'SELECT 1', readiness)
    script('hosted-rules-cleanup.sql')
    sql(guard(readiness))
    checks.push('pre-schema-interrupted-install-cleanup')
    script('hosted-rules-preprovision.sql')
    sql(
      `CREATE SCHEMA pathways_rules_internal AUTHORIZATION rules_store_owner;
GRANT USAGE,CREATE ON SCHEMA pathways_rules_internal TO prisma,rules_context_owner,rules_config_owner;
CREATE FUNCTION pathways_rules_internal.assert_runtime_provisioned() RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ ${readiness} $$;
ALTER FUNCTION pathways_rules_internal.assert_runtime_provisioned() OWNER TO rules_context_owner;
REVOKE ALL ON FUNCTION pathways_rules_internal.assert_runtime_provisioned() FROM PUBLIC;`,
      'prisma',
    )
    sql('ALTER ROLE rules_capacity_owner INHERIT;')
    script('hosted-rules-cleanup.sql', 'f', '42501')
    const residual =
      sql(`SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member
WHERE r.rolname='prisma' AND m.roleid IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY(${featureRoles}));`)
    assert.equal(residual.trim(), '0')
    sql('ALTER ROLE rules_capacity_owner NOINHERIT;')
    sql(guard(readiness))
    checks.push('post-commit-readiness-failure-does-not-restore-authority')
    const dbCreate = sql("SELECT has_database_privilege('prisma',current_database(),'CREATE');")
    assert.equal(dbCreate.trim(), 'f')
    assert.equal(sql(databaseAclSql), originalDatabaseAcl)
    checks.push('exact-original-database-acl-restored')
    sql('SELECT pathways_rules_internal.assert_runtime_provisioned();', 'postgres', '42501')
    checks.push('no-new-private-helper-access-for-hosted-dba')
    // Separate three-owner profile; never merge the rules sixteen.
    const coreSql = fs.readFileSync(coreMigration, 'utf8')
    const coreInstallation = coreSql.match(
      /DO \$\$ (DECLARE role_name text;existing record;[\s\S]*?)END \$\$;/,
    )?.[1]
    const coreReadiness = coreSql.match(
      /CREATE FUNCTION pathways\.p34_assert_projection_provisioned\(\)[\s\S]*?AS \$\$\r?\n([\s\S]*?)END \$\$;/,
    )?.[1]
    assert.ok(coreInstallation && coreReadiness, 'Canonical three-owner guards required')
    const coreInstallBody = `${coreInstallation}END`
    const coreReadyBody = `${coreReadiness}END`
    // Install the immutable baseline helper definitions, not surrogate bodies.
    // This role/ACL fixture never executes their business-data queries.
    const baselineFile = path.join(
      repository,
      'apps/api/prisma/migrations/0000_pathways_baseline_through_0026/migration.sql',
    )
    const baselineSql = fs.readFileSync(baselineFile, 'utf8')
    inputHashes[path.relative(repository, baselineFile)] = createHash('sha256')
      .update(fs.readFileSync(baselineFile))
      .digest('hex')
    for (const name of ['runtime_context_organization', 'runtime_context_user']) {
      const start = baselineSql.indexOf(`CREATE FUNCTION pathways.${name}()`)
      const end = baselineSql.indexOf('$;', start)
      assert.ok(start >= 0 && end > start, 'Immutable baseline helper definition required')
      sql(
        `${baselineSql.slice(start, end + 3)}\nALTER FUNCTION pathways.${name}() OWNER TO postgres;\nREVOKE ALL ON FUNCTION pathways.${name}() FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION pathways.${name}() TO pathways_runtime;`,
        'supabase_admin',
      )
    }
    const helperAclSql =
      "SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',p.proowner,'acl',coalesce(p.proacl,acldefault('f',p.proowner))) ORDER BY p.proname) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pathways' AND p.proname IN ('runtime_context_organization','runtime_context_user');"
    const originalHelperAcl = sql(helperAclSql)
    const helperInstall = coreSql.match(
      /DO \$context_install\$ ([\s\S]*?)END \$context_install\$;/,
    )?.[1]
    assert.ok(helperInstall, 'Canonical helper installation check required')
    const helperInstallBody = `${helperInstall}END`
    sql(
      "INSERT INTO public._prisma_migrations VALUES('0033_core_canonical_activity_review_guard',now(),NULL);",
    )
    script('hosted-core-preprovision.sql')
    sql(guard(coreInstallBody), 'prisma')
    sql(guard(helperInstallBody), 'prisma')
    checks.push('three-owner-ordinary-creator-exact-installation')
    function coreNegative(name, mutation, ready = false) {
      sql(
        `BEGIN; ${mutation}; ${guard(ready ? coreReadyBody : coreInstallBody)} ROLLBACK;`,
        'supabase_admin',
        ready ? '42501' : '55000',
      )
      checks.push(`three-owner-${name}`)
    }
    coreNegative(
      'wrong-temporary-grantor-duplicate',
      'GRANT public_projection_owner TO prisma WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY supabase_admin',
    )
    for (const option of ['ADMIN TRUE', 'INHERIT FALSE', 'SET FALSE']) {
      coreNegative(
        `wrong-temporary-${option}`,
        `SET LOCAL ROLE postgres; GRANT public_projection_owner TO prisma WITH ${option} GRANTED BY postgres`,
      )
    }
    for (const option of ['INHERIT TRUE', 'SET TRUE']) {
      coreNegative(
        `wrong-bootstrap-${option}`,
        `GRANT public_projection_owner TO postgres WITH ${option} GRANTED BY supabase_admin`,
      )
    }
    coreNegative('outgoing-role', 'GRANT pathways_runtime TO public_projection_owner')
    coreNegative('direct-app-role', 'GRANT public_projection_owner TO pathways_runtime')
    coreNegative(
      'transitive-admin-only-app-role',
      'GRANT prisma TO pathways_runtime WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',
    )
    coreNegative('lingering-temporary-authority', 'SELECT 1', true)
    function helperNegative(name, mutation) {
      const mutationOutput = sql(
        `BEGIN; ${mutation}; SELECT 'CONTEXT_MUTATION_APPLIED'; ${guard(helperInstallBody)} ROLLBACK;`,
        'supabase_admin',
        '42501',
      )
      assert.equal(
        mutationOutput.trim(),
        'CONTEXT_MUTATION_APPLIED',
        'Helper mutation did not complete before canonical denial',
      )
      checks.push(`three-owner-context-${name}`)
    }
    helperNegative('wrong-owner', 'ALTER FUNCTION pathways.runtime_context_user() OWNER TO prisma')
    helperNegative(
      'wrong-body',
      'CREATE OR REPLACE FUNCTION pathways.runtime_context_user() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $bad$ BEGIN RETURN NULL; END $bad$',
    )
    // Superuser object GRANT is recorded as the owner. Construct a real
    // delegated foreign-grantor chain within this rolled-back negative only.
    helperNegative(
      'foreign-grantor-delegation-chain',
      "SET LOCAL ROLE postgres; GRANT EXECUTE ON FUNCTION pathways.runtime_context_user() TO pathways_runtime WITH GRANT OPTION; SET LOCAL ROLE pathways_runtime; GRANT EXECUTE ON FUNCTION pathways.runtime_context_user() TO report_projection_owner; RESET ROLE; DO $grantor$ BEGIN IF (SELECT count(*) FROM pg_catalog.aclexplode((SELECT proacl FROM pg_catalog.pg_proc WHERE oid='pathways.runtime_context_user()'::regprocedure)) a WHERE a.grantor=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime') AND a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='report_projection_owner'))<>1 THEN RAISE EXCEPTION 'Expected delegated grantor mutation absent'; END IF; END $grantor$",
    )
    helperNegative(
      'grant-option',
      'SET LOCAL ROLE postgres; GRANT EXECUTE ON FUNCTION pathways.runtime_context_user() TO report_projection_owner WITH GRANT OPTION',
    )
    helperNegative(
      'unexpected-grantee',
      'SET LOCAL ROLE postgres; GRANT EXECUTE ON FUNCTION pathways.runtime_context_user() TO prisma',
    )
    helperNegative(
      'missing-recipient',
      'SET LOCAL ROLE postgres; REVOKE EXECUTE ON FUNCTION pathways.runtime_context_user() FROM finance_operation_owner',
    )
    // No completed0034 row: unsuccessful installation restores exact original ACLs.
    script('hosted-core-cleanup.sql')
    assert.equal(sql(helperAclSql), originalHelperAcl)
    sql(guard(coreReadyBody), 'postgres', '42501')
    assert.equal(sql(databaseAclSql), originalDatabaseAcl)
    checks.push('three-owner-incomplete-install-restores-exact-baseline-helper-acl')
    // Independent completed profile: direct grants persist, delegation does not.
    script('hosted-core-preprovision.sql')
    sql(guard(helperInstallBody), 'prisma')
    sql("INSERT INTO public._prisma_migrations VALUES('0034_core_feature_completion',now(),NULL);")
    script('hosted-core-cleanup.sql')
    sql(guard(coreReadyBody))
    const finalHelperAcl = sql(helperAclSql)
    assert.notEqual(finalHelperAcl, originalHelperAcl)
    assert.equal(
      sql(
        "SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a WHERE n.nspname='pathways' AND p.proname IN ('runtime_context_organization','runtime_context_user') AND (a.is_grantable OR a.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma'));",
      ).trim(),
      '0',
    )
    checks.push('three-owner-completed-install-keeps-only-exact-direct-helper-grants')
    assert.equal(sql(databaseAclSql), originalDatabaseAcl)
    checks.push('three-owner-success-cleanup-no-database-acl-change')
    coreNegative(
      'lingering-schema-create',
      'GRANT CREATE ON SCHEMA pathways TO finance_operation_owner',
      true,
    )
    // Recreate only the known temporary edges/schema grants for the completed
    // synthetic ledger profile; preprovision correctly refuses completed0034.
    sql(
      'GRANT public_projection_owner,report_projection_owner,finance_operation_owner TO prisma WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY postgres; GRANT CREATE ON SCHEMA pathways TO public_projection_owner,report_projection_owner,finance_operation_owner;',
    )
    sql('ALTER ROLE finance_operation_owner INHERIT;')
    script('hosted-core-cleanup.sql', 'f', '42501')
    assert.equal(
      sql(
        "SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND roleid IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('public_projection_owner','report_projection_owner','finance_operation_owner'));",
      ).trim(),
      '0',
    )
    assert.equal(
      sql(
        "SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('public_projection_owner','report_projection_owner','finance_operation_owner') AND has_schema_privilege(oid,'pathways','CREATE');",
      ).trim(),
      '0',
    )
    sql('ALTER ROLE finance_operation_owner NOINHERIT;')
    sql(guard(coreReadyBody))
    assert.equal(sql(databaseAclSql), originalDatabaseAcl)
    assert.equal(sql(helperAclSql), finalHelperAcl)
    checks.push('three-owner-postcommit-readiness-failure-persists-cleanup')
    passed = true
  } finally {
    if (startAttempted) {
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(owned, 'owned.json'))), marker)
      const status = command('pg_ctl', ['-D', data, 'status']).status
      assert.ok(status === 0 || status === 3, 'Owned server status uncertain')
      if (status === 0) {
        assert.equal(
          sql('SHOW data_directory;', 'supabase_admin').trim().replaceAll('\\', '/'),
          data.replaceAll('\\', '/'),
        )
        assert.equal(
          command('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']).status,
          0,
          'Owned shutdown failed',
        )
      }
      await assertPortFree()
      cleanupVerified = true
    }
    fs.writeFileSync(
      path.join(owned, 'result.json'),
      JSON.stringify(
        {
          passed,
          checks,
          inputHashes,
          started,
          ownedStopAndPortFree: cleanupVerified,
          scope:
            'Synthetic local role/ACL rehearsal only; no hosted migration or complete domain upgrade executed.',
        },
        null,
        2,
      ),
    )
    process.stdout.write(`Evidence: ${owned}\n`)
  }
  return owned
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearse(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack}\n`)
    process.exitCode = 1
  })
}
