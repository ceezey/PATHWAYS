# Isolated PostgreSQL 17 upgrade rehearsal for migration 0023 only.
# The container is synthetic, loopback-only, and removed in finally.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ruleAccessRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$ruleAccessPsql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$ruleAccessPort = 55450
$ruleAccessName = 'pathways-rule-access-pg17-' + [guid]::NewGuid().ToString('N')
$ruleAccessContainerId = $null
$ruleAccessExit = 1

function Invoke-RuleAccessSql([string]$Sql, [string]$Role = 'postgres') {
  $Sql | & $ruleAccessPsql -X -w -q -h 127.0.0.1 -p $ruleAccessPort -U $Role -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL 17 rule-access SQL failed for role $Role." }
}

try {
  $ruleAccessListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $ruleAccessPort)
  try { $ruleAccessListener.Start() } finally { $ruleAccessListener.Stop() }

  $ruleAccessContainerId = (& docker run --rm --name $ruleAccessName `
    -e POSTGRES_HOST_AUTH_METHOD=trust `
    -p "127.0.0.1:${ruleAccessPort}:5432" `
    -d postgres:17).Trim()
  if ($LASTEXITCODE -ne 0 -or $ruleAccessContainerId -notmatch '^[a-f0-9]{64}$') {
    throw 'PostgreSQL 17 disposable container creation failed.'
  }

  $ruleAccessDeadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    & 'C:\Program Files\PostgreSQL\18\bin\pg_isready.exe' -q `
      -h 127.0.0.1 -p $ruleAccessPort -U postgres -d postgres
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $ruleAccessDeadline)
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 17 disposable container readiness timed out.' }

  Invoke-RuleAccessSql @'
CREATE ROLE prisma LOGIN;
CREATE ROLE pathways_runtime NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA pathways AUTHORIZATION prisma;
SET ROLE prisma;
CREATE TABLE pathways.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE pathways.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE pathways.role_permissions (
  role_id uuid NOT NULL REFERENCES pathways.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES pathways.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id,permission_id)
);
ALTER TABLE pathways.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pathways.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_roles_select ON pathways.roles FOR SELECT TO pathways_runtime
  USING (nullif(current_setting('app.organization_id',true),'')::uuid IS NOT NULL);
CREATE POLICY runtime_permissions_select ON pathways.permissions FOR SELECT TO pathways_runtime
  USING (nullif(current_setting('app.organization_id',true),'')::uuid IS NOT NULL);
CREATE POLICY runtime_mappings_select ON pathways.role_permissions FOR SELECT TO pathways_runtime
  USING (nullif(current_setting('app.organization_id',true),'')::uuid IS NOT NULL);
GRANT USAGE ON SCHEMA pathways TO pathways_runtime;
GRANT SELECT ON pathways.roles,pathways.permissions,pathways.role_permissions TO pathways_runtime;
INSERT INTO pathways.roles(code,name) VALUES
  ('PROJECT_MANAGER','Project Manager'),
  ('MONITORING_AND_EVALUATION_OFFICER','Monitoring and Evaluation Officer'),
  ('PROJECT_OFFICER','Project Officer');
INSERT INTO pathways.permissions(code,name) VALUES
  ('rules.read','rules.read'),
  ('rules.create','rules.create'),
  ('rules.update','rules.update'),
  ('rules.activate','rules.activate'),
  ('recommendations.outcome.record','recommendations.outcome.record');
INSERT INTO pathways.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM pathways.roles r CROSS JOIN pathways.permissions p
WHERE (r.code='MONITORING_AND_EVALUATION_OFFICER' AND p.code='rules.read')
   OR (r.code='PROJECT_MANAGER' AND p.code IN ('rules.read','recommendations.outcome.record'));
RESET ROLE;
'@

  & $ruleAccessPsql -X -w -q -h 127.0.0.1 -p $ruleAccessPort -U prisma -d postgres `
    -v ON_ERROR_STOP=1 -f (Join-Path $ruleAccessRoot 'apps/api/prisma/migrations/0023_rule_based_access_alignment/migration.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Migration 0023 failed on PostgreSQL 17.' }

  Invoke-RuleAccessSql @'
DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'Upgrade rehearsal did not run on PostgreSQL 17';
  END IF;
  IF (SELECT count(*) FROM pathways.permissions
      WHERE code IN ('alerts.read','alerts.review','alerts.outcome.record','recommendations.read','recommendations.review')
        AND name=code AND is_active) <> 5 THEN
    RAISE EXCEPTION 'PostgreSQL 17 permission definition contract failed';
  END IF;
  IF (SELECT count(*) FROM pathways.role_permissions rp
      JOIN pathways.roles r ON r.id=rp.role_id
      JOIN pathways.permissions p ON p.id=rp.permission_id
      WHERE r.code IN ('MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER')
        AND p.code IN ('rules.read','alerts.read','alerts.review','alerts.outcome.record','recommendations.read','recommendations.review','recommendations.outcome.record')) <> 14 THEN
    RAISE EXCEPTION 'PostgreSQL 17 target mapping contract failed';
  END IF;
  IF (SELECT count(*) FROM pathways.role_permissions rp
      JOIN pathways.roles r ON r.id=rp.role_id
      JOIN pathways.permissions p ON p.id=rp.permission_id
      WHERE r.code='PROJECT_MANAGER'
        AND p.code IN ('rules.read','recommendations.outcome.record')) <> 2 THEN
    RAISE EXCEPTION 'PostgreSQL 17 unrelated-role fingerprint changed';
  END IF;
  IF EXISTS (
      SELECT FROM pathways.role_permissions rp
      JOIN pathways.roles r ON r.id=rp.role_id
      JOIN pathways.permissions p ON p.id=rp.permission_id
      WHERE r.code IN ('MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER')
        AND p.code IN ('rules.create','rules.update','rules.activate')) THEN
    RAISE EXCEPTION 'PostgreSQL 17 rule-management denial failed';
  END IF;
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='pathways_runtime') THEN
    RAISE EXCEPTION 'PostgreSQL 17 runtime role security changed';
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE pathways_runtime;
SELECT set_config('app.organization_id','93000000-0000-4000-8000-000000000001',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM pathways.role_permissions rp
      JOIN pathways.roles r ON r.id=rp.role_id
      JOIN pathways.permissions p ON p.id=rp.permission_id
      WHERE r.code IN ('MONITORING_AND_EVALUATION_OFFICER','PROJECT_OFFICER')
        AND p.code IN ('rules.read','alerts.read','alerts.review','alerts.outcome.record','recommendations.read','recommendations.review','recommendations.outcome.record')) <> 14 THEN
    RAISE EXCEPTION 'Runtime-equivalent permission visibility failed';
  END IF;
  BEGIN
    INSERT INTO pathways.permissions(code,name) VALUES ('forbidden.write','forbidden.write');
    RAISE EXCEPTION 'Runtime role unexpectedly wrote a permission';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$$;
ROLLBACK;
'@

  Write-Output 'RULE_BASED_ACCESS_PG17_UPGRADE_REHEARSAL=PASS'
  Write-Output 'RULE_BASED_ACCESS_PG17_RUNTIME_ROLE_CHECK=PASS'
  $ruleAccessExit = 0
} catch {
  Write-Output ('RULE_BASED_ACCESS_PG17_UPGRADE_REHEARSAL=FAILED; ' + $_.Exception.Message)
  $ruleAccessExit = 1
} finally {
  if ($null -ne $ruleAccessContainerId -and $ruleAccessContainerId -match '^[a-f0-9]{64}$') {
    $ruleAccessActualId = (& docker inspect --format '{{.Id}}' $ruleAccessName 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $ruleAccessActualId -ceq $ruleAccessContainerId) {
      & docker stop $ruleAccessContainerId | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Output 'RULE_BASED_ACCESS_PG17_DISPOSABLE_CLEANUP=PASS'
      } else {
        Write-Output 'RULE_BASED_ACCESS_PG17_DISPOSABLE_CLEANUP=FAILED'
        $ruleAccessExit = 1
      }
    } else {
      Write-Output 'RULE_BASED_ACCESS_PG17_DISPOSABLE_CLEANUP=UNCERTAIN'
      $ruleAccessExit = 1
    }
  }
}

exit $ruleAccessExit
