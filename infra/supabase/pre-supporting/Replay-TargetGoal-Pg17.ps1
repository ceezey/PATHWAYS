# Isolated PostgreSQL 17 upgrade rehearsal for migration 0022 only.
# The container is synthetic, loopback-only, and removed in finally.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$targetGoalRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$targetGoalPsql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$targetGoalPort = 55449
$targetGoalName = 'pathways-target-goal-pg17-' + [guid]::NewGuid().ToString('N')
$targetGoalContainerId = $null
$targetGoalExit = 1

function Invoke-TargetGoalSql([string]$Sql, [string]$Role = 'postgres') {
  $Sql | & $targetGoalPsql -X -w -q -h 127.0.0.1 -p $targetGoalPort -U $Role -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL 17 target-goal SQL failed for role $Role." }
}

try {
  $targetGoalListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $targetGoalPort)
  try { $targetGoalListener.Start() } finally { $targetGoalListener.Stop() }

  $targetGoalContainerId = (& docker run --rm --name $targetGoalName `
    -e POSTGRES_HOST_AUTH_METHOD=trust `
    -p "127.0.0.1:${targetGoalPort}:5432" `
    -d postgres:17).Trim()
  if ($LASTEXITCODE -ne 0 -or $targetGoalContainerId -notmatch '^[a-f0-9]{64}$') {
    throw 'PostgreSQL 17 disposable container creation failed.'
  }

  $targetGoalDeadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    & docker exec $targetGoalContainerId pg_isready -q -U postgres
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $targetGoalDeadline)
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 17 disposable container readiness timed out.' }

  Invoke-TargetGoalSql @'
CREATE ROLE prisma LOGIN;
CREATE ROLE pathways_runtime NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA pathways AUTHORIZATION prisma;
SET ROLE prisma;
CREATE TABLE pathways.projects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  code text NOT NULL,
  title text NOT NULL
);
ALTER TABLE pathways.projects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA pathways TO pathways_runtime;
GRANT SELECT, INSERT, UPDATE ON pathways.projects TO pathways_runtime;
CREATE POLICY target_goal_runtime_select ON pathways.projects FOR SELECT TO pathways_runtime USING (true);
CREATE POLICY target_goal_runtime_update ON pathways.projects FOR UPDATE TO pathways_runtime USING (true) WITH CHECK (true);
INSERT INTO pathways.projects(id,organization_id,code,title) VALUES
 ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','PG17-TG','PG17 upgrade fixture');
RESET ROLE;
'@

  & $targetGoalPsql -X -w -q -h 127.0.0.1 -p $targetGoalPort -U prisma -d postgres `
    -v ON_ERROR_STOP=1 -f (Join-Path $targetGoalRoot 'apps/api/prisma/migrations/0022_project_target_goal/migration.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Migration 0022 failed on PostgreSQL 17.' }

  Invoke-TargetGoalSql @'
DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'Upgrade rehearsal did not run on PostgreSQL 17';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='pathways' AND table_name='projects' AND column_name='target_goal'
      AND data_type='numeric' AND numeric_precision=7 AND numeric_scale=4
      AND is_nullable='YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'PostgreSQL 17 target_goal column contract failed';
  END IF;
  IF (SELECT target_goal IS NOT NULL FROM pathways.projects
      WHERE id='93000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'PostgreSQL 17 upgrade fabricated an existing target';
  END IF;
  IF NOT has_column_privilege('pathways_runtime','pathways.projects','target_goal','SELECT')
     OR NOT has_column_privilege('pathways_runtime','pathways.projects','target_goal','INSERT')
     OR NOT has_column_privilege('pathways_runtime','pathways.projects','target_goal','UPDATE')
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='pathways.projects'::regclass) THEN
    RAISE EXCEPTION 'PostgreSQL 17 runtime privilege or RLS inheritance failed';
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE pathways_runtime;
UPDATE pathways.projects SET target_goal=62.5000
WHERE id='93000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  IF (SELECT target_goal::text<>'62.5000' FROM pathways.projects
      WHERE id='93000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'PostgreSQL 17 exact target persistence failed';
  END IF;
  BEGIN
    UPDATE pathways.projects SET target_goal=0;
    RAISE EXCEPTION 'PostgreSQL 17 accepted a zero target';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE pathways.projects SET target_goal=100.0001;
    RAISE EXCEPTION 'PostgreSQL 17 accepted a target above 100';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$$;
ROLLBACK;
'@

  Write-Output 'TARGET_GOAL_PG17_UPGRADE_REHEARSAL=PASS'
  Write-Output 'TARGET_GOAL_PG17_RUNTIME_ROLE_CHECK=PASS'
  $targetGoalExit = 0
} catch {
  Write-Output ('TARGET_GOAL_PG17_UPGRADE_REHEARSAL=FAILED; ' + $_.Exception.Message)
  $targetGoalExit = 1
} finally {
  if ($null -ne $targetGoalContainerId -and $targetGoalContainerId -match '^[a-f0-9]{64}$') {
    $targetGoalActualId = (& docker inspect --format '{{.Id}}' $targetGoalName 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $targetGoalActualId -ceq $targetGoalContainerId) {
      & docker stop $targetGoalContainerId | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Output 'TARGET_GOAL_PG17_DISPOSABLE_CLEANUP=PASS'
      } else {
        Write-Output 'TARGET_GOAL_PG17_DISPOSABLE_CLEANUP=FAILED'
        $targetGoalExit = 1
      }
    } else {
      Write-Output 'TARGET_GOAL_PG17_DISPOSABLE_CLEANUP=UNCERTAIN'
      $targetGoalExit = 1
    }
  }
}

exit $targetGoalExit
