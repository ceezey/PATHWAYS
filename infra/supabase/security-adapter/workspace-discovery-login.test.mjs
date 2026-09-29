import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { historicalMigration } from '../../../scripts/migrations/history.mjs'
import { buildLoginHelperSql, discoveryBody, ledgerNames } from './workspace-discovery-login.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ledger = ledgerNames.map((name) => ({ name, checksum: 'a'.repeat(64) }))
const apply = buildLoginHelperSql(ledger)
const rollback = buildLoginHelperSql(ledger, { rollback: true })

test('helper matches the reviewed migration body exactly', () => {
  const source = historicalMigration('0007_core_workspace_foundation', 'utf8').replaceAll(
    '\r\n',
    '\n',
  )
  assert.equal(
    source.match(/p1_workspace_for_auth\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1],
    discoveryBody,
  )
})

test('input guard rejects wrong prefixes, checksums and injection', () => {
  for (const wrong of [[], ledger.slice(1), [...ledger, ledger[0]], [...ledger].reverse()]) {
    assert.throws(() => buildLoginHelperSql(wrong), /INPUT_REJECTED/)
  }
  for (const checksum of ['bad', "'; SELECT 1; --", 'a'.repeat(65)]) {
    assert.throws(() => buildLoginHelperSql([{ ...ledger[0], checksum }, ...ledger.slice(1)]))
  }
  assert.throws(() => buildLoginHelperSql(ledger, { rollback: 'true' }))
})

test('change does not write data, ledger, table grants or policies', () => {
  assert.doesNotMatch(
    apply,
    /(?:INSERT INTO|UPDATE\s+pathways|DELETE FROM|ALTER TABLE|CREATE POLICY|DROP POLICY|CREATE OR REPLACE)/i,
  )
  assert.match(apply, /GRANT EXECUTE ON FUNCTION pathways\.p1_workspace_for_auth/)
  assert.match(rollback, /DROP FUNCTION pathways\.p1_workspace_for_auth\(\) RESTRICT/)
  assert.match(rollback, /LOGIN_HELPER_DEFINITION_REJECTED/)
})

test(
  'guarded helper on an isolated synthetic loopback PostgreSQL',
  { timeout: 180_000 },
  async (t) => {
    const port = 55460
    const pg = 'C:/Program Files/PostgreSQL/18/bin'
    const scratchRoot = fs.realpathSync(path.join(root, '.tmp'))
    const prefix = 'pathways-login-helper-test-'
    let scratch
    let started = false
    let stopped = false
    let commandUncertain = false
    const probe = net.createServer()
    await new Promise((resolve, reject) => {
      probe.once('error', () => reject(new Error('LOCAL_TEST_PORT_BUSY')))
      probe.listen(port, '127.0.0.1', () => probe.close(resolve))
    })
    scratch = fs.mkdtempSync(path.join(scratchRoot, prefix))
    const data = path.join(scratch, 'data')
    const env = {
      SystemRoot: process.env.SystemRoot,
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      PATH: 'C:\\Windows\\System32',
      TEMP: scratch,
      TMP: scratch,
      PGPASSFILE: 'NUL',
      PGCONNECT_TIMEOUT: '5',
      PGSSLMODE: 'disable',
    }
    function command(tool, args, input) {
      const result = spawnSync(path.join(pg, `${tool}.exe`), args, {
        cwd: scratch,
        env,
        input,
        // These controllers launch children. Do not let a background child keep
        // the controller's captured pipe open after the controller has exited.
        stdio: tool === 'initdb' || tool === 'pg_ctl' ? 'ignore' : 'pipe',
        encoding: 'utf8',
        windowsHide: true,
        timeout: tool === 'initdb' ? 60_000 : tool === 'pg_ctl' ? 45_000 : 20_000,
        maxBuffer: 200_000,
      })
      if (result.error) commandUncertain = true
      return result
    }
    function success(result, stage) {
      if (['LOCAL_INIT_FAILED', 'LOCAL_START_FAILED'].includes(stage) && result.status !== 0) {
        // This child sees only synthetic input and a clean environment.
        t.diagnostic(
          String(result.stderr || result.error?.code || 'NO_DIAGNOSTIC')
            .replaceAll(scratch, '[synthetic directory]')
            .slice(0, 1200),
        )
      }
      assert.ok(!result.error && result.status === 0, stage)
      return String(result.stdout ?? '').trim()
    }
    function sql(input, fail = false) {
      const result = command(
        'psql',
        [
          '-X',
          '-w',
          '-q',
          '-A',
          '-t',
          '-h',
          '127.0.0.1',
          '-p',
          String(port),
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        input,
      )
      if (fail) {
        assert.ok(!result.error && result.status !== 0, 'EXPECTED_SQL_DENIAL')
        return
      }
      return success(result, 'SYNTHETIC_SQL_FAILED')
    }
    const subject = '00000000-0000-4000-8000-000000000001'
    const otherSubject = '00000000-0000-4000-8000-000000000002'
    const org = '00000000-0000-4000-8000-000000000003'
    const foreignOrg = '00000000-0000-4000-8000-000000000004'
    const role = '00000000-0000-4000-8000-000000000005'
    function discover(auth = subject, extra = '') {
      return sql(`BEGIN; SET LOCAL ROLE pathways_runtime;
      SET LOCAL request.jwt.claim.sub='${auth}'; ${extra}
      SELECT count(*) FROM pathways.p1_workspace_for_auth(); ROLLBACK;`)
    }
    function unchanged() {
      return sql(`SELECT md5(jsonb_build_array(
      (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM pathways.system_users u),
      (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM pathways.organizations o),
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM pathways.roles r),
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY migration_name) FROM public._prisma_migrations m),
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),
      (SELECT jsonb_agg(jsonb_build_array(oid,relacl,relowner) ORDER BY oid) FROM pg_class)
    )::text);`)
    }
    try {
      success(
        command('initdb', [
          '-D',
          data,
          '-U',
          'postgres',
          '-A',
          'trust',
          '--encoding=UTF8',
          '--locale=C',
          // Disposable semantic tests only; not a backup/durability rehearsal.
          '--no-sync',
        ]),
        'LOCAL_INIT_FAILED',
      )
      // No existing service/configuration is touched. Port, directory and host are fixed here.
      const start = command('pg_ctl', [
        '-D',
        data,
        '-l',
        path.join(scratch, 'postgres.log'),
        '-o',
        `-h 127.0.0.1 -p ${port}`,
        '-w',
        '-t',
        '30',
        'start',
      ])
      started = true // Even failed startup must be checked before removing its directory.
      success(start, 'LOCAL_START_FAILED')
      assert.equal(
        sql(`SELECT current_setting('data_directory') = '${data.replaceAll('\\', '/')}'
      AND inet_server_addr()='127.0.0.1'::inet AND inet_server_port()=${port};`),
        't',
      )
      sql(`CREATE ROLE prisma NOLOGIN; CREATE ROLE pathways_runtime LOGIN NOBYPASSRLS;
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA pathways AUTHORIZATION prisma;
      CREATE TABLE public._prisma_migrations(migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz);
      ALTER TABLE public._prisma_migrations OWNER TO prisma;
      INSERT INTO public._prisma_migrations VALUES ${ledger.map((r) => `('${r.name}','${r.checksum}',now(),NULL)`).join(',')};
      SET ROLE prisma;
      CREATE TABLE pathways.organizations(id uuid PRIMARY KEY,status text,archived_at timestamptz);
      CREATE TABLE pathways.roles(id uuid PRIMARY KEY,is_active boolean);
      CREATE TABLE pathways.system_users(id uuid PRIMARY KEY,organization_id uuid,role_id uuid,auth_user_id uuid,account_status text,archived_at timestamptz);
      ALTER TABLE pathways.organizations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE pathways.roles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE pathways.system_users ENABLE ROW LEVEL SECURITY;
      CREATE POLICY p4_runtime_lock ON pathways.system_users FOR UPDATE TO pathways_runtime USING(false) WITH CHECK(false);
      GRANT USAGE ON SCHEMA pathways TO pathways_runtime,anon,authenticated,service_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA pathways TO pathways_runtime;
      GRANT UPDATE(id) ON pathways.system_users TO pathways_runtime;
      INSERT INTO pathways.roles VALUES('${role}',true);
      INSERT INTO pathways.organizations VALUES('${org}','ACTIVE',NULL),('${foreignOrg}','ACTIVE',NULL);
      INSERT INTO pathways.system_users VALUES
        ('00000000-0000-4000-8000-000000000006','${org}','${role}','${subject}','ACTIVE',NULL),
        ('00000000-0000-4000-8000-000000000007','${foreignOrg}','${role}','${otherSubject}','ACTIVE',NULL);
      RESET ROLE;`)
      const original = unchanged()
      await t.test('missing helper reproduces the original database failure', () => {
        sql('SELECT * FROM pathways.p1_workspace_for_auth();', true)
      })
      await t.test('install creates only the exact helper', () => {
        sql(apply)
        assert.equal(unchanged(), original)
        assert.equal(discover(), '1')
      })
      await t.test('repeat installation refuses existing objects', () => sql(apply, true))
      await t.test('missing and unknown identities return zero', () => {
        assert.equal(discover(''), '0')
        assert.equal(discover('00000000-0000-4000-8000-000000000099'), '0')
      })
      await t.test('forged selectors and metadata cannot choose another organization', () => {
        assert.equal(
          discover(
            subject,
            `SET LOCAL app.organization_id='${foreignOrg}';
        SET LOCAL request.jwt.claims='{"sub":"${otherSubject}"}';`,
          ),
          '1',
        )
        assert.equal(
          sql(`BEGIN; SET LOCAL ROLE pathways_runtime;
        SET LOCAL request.jwt.claim.sub='${subject}';
        SELECT bool_and(organization_id='${org}'::uuid) FROM pathways.p1_workspace_for_auth(); ROLLBACK;`),
          't',
        )
      })
      await t.test('malformed subject is denied, never authorized', () => {
        sql(
          "SET request.jwt.claim.sub='malformed'; SELECT * FROM pathways.p1_workspace_for_auth();",
          true,
        )
      })
      await t.test('public API roles cannot execute the helper', () => {
        for (const name of ['anon', 'authenticated', 'service_role']) {
          sql(`SET ROLE ${name}; SELECT * FROM pathways.p1_workspace_for_auth();`, true)
        }
      })
      await t.test('underlying table access remains denied without context', () => {
        assert.equal(
          sql('SET ROLE pathways_runtime; SELECT count(*) FROM pathways.system_users;'),
          '0',
        )
      })
      await t.test('revoked membership, disabled role and organization are re-read', () => {
        for (const [disable, restore] of [
          [
            "UPDATE pathways.system_users SET account_status='SUSPENDED'",
            "UPDATE pathways.system_users SET account_status='ACTIVE'",
          ],
          [
            'UPDATE pathways.system_users SET archived_at=now()',
            'UPDATE pathways.system_users SET archived_at=NULL',
          ],
          ['UPDATE pathways.roles SET is_active=false', 'UPDATE pathways.roles SET is_active=true'],
          [
            "UPDATE pathways.organizations SET status='INACTIVE'",
            "UPDATE pathways.organizations SET status='ACTIVE'",
          ],
          [
            'UPDATE pathways.organizations SET archived_at=now()',
            'UPDATE pathways.organizations SET archived_at=NULL',
          ],
        ]) {
          sql(disable)
          assert.equal(discover(), '0')
          sql(restore)
          assert.equal(discover(), '1')
        }
      })
      await t.test('unexpected multiple memberships are not silently reduced to one', () => {
        sql(`UPDATE pathways.system_users SET auth_user_id='${subject}';`)
        assert.equal(discover(), '2')
        sql(
          `UPDATE pathways.system_users SET auth_user_id='${otherSubject}' WHERE organization_id='${foreignOrg}';`,
        )
      })
      await t.test('rollback rejects privilege drift and dependencies', () => {
        sql('SET ROLE prisma; GRANT EXECUTE ON FUNCTION pathways.p1_workspace_for_auth() TO anon;')
        sql(rollback, true)
        sql(
          'SET ROLE prisma; REVOKE EXECUTE ON FUNCTION pathways.p1_workspace_for_auth() FROM anon;',
        )
        sql(
          'CREATE VIEW public.synthetic_dependency AS SELECT * FROM pathways.p1_workspace_for_auth();',
        )
        sql(rollback, true)
        sql('DROP VIEW public.synthetic_dependency;')
      })
      await t.test('rollback refuses definition and ledger drift', () => {
        sql('SET ROLE prisma; ALTER FUNCTION pathways.p1_workspace_for_auth() VOLATILE;')
        sql(rollback, true)
        sql('SET ROLE prisma; ALTER FUNCTION pathways.p1_workspace_for_auth() STABLE;')
        sql("UPDATE public._prisma_migrations SET checksum=repeat('b',64);")
        sql(rollback, true)
        sql("UPDATE public._prisma_migrations SET checksum=repeat('a',64);")
      })
      await t.test('guarded rollback restores the original state', () => {
        assert.equal(unchanged(), original)
        sql(rollback)
        assert.equal(
          sql("SELECT to_regprocedure('pathways.p1_workspace_for_auth()') IS NULL;"),
          't',
        )
        assert.equal(unchanged(), original)
        sql(apply)
        assert.equal(discover(), '1')
      })
    } finally {
      if (started) {
        const stop = command('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '10', 'stop'])
        const status = command('pg_ctl', ['-D', data, 'status'])
        stopped = !stop.error && stop.status === 0 && !status.error && status.status === 3
      } else stopped = !commandUncertain
      assert.ok(
        stopped &&
          path.dirname(scratch) === scratchRoot &&
          path.basename(scratch).startsWith(prefix) &&
          fs.realpathSync(scratch) === scratch,
        'LOCAL_STOP_UNCERTAIN_DIRECTORY_PRESERVED',
      )
      fs.rmSync(scratch, { recursive: true })
      assert.equal(fs.existsSync(scratch), false, 'LOCAL_CLEANUP_FAILED')
      t.diagnostic('Disposable loopback database stopped and removed; no hosted connections.')
    }
  },
)
