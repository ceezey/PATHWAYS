import { PrismaClient } from '@prisma/client'

import { assertLocalDemoTarget } from './local-demo-target'

// Synthetic, local-only production-scale volume for G-F8-7; never run against a hosted database.
export const LOAD_SCALE = {
  projects: 20,
  beneficiaries: 10000,
  events: 50000,
  indicators: 200,
  readings: 12,
}

export function loadSeedStatements(s = LOAD_SCALE) {
  const org = '(SELECT id FROM pathways.organizations ORDER BY created_at LIMIT 1)'
  const user = "(SELECT id FROM pathways.system_users WHERE email = 'jose.reyes@pathways.example')"
  const me =
    "(SELECT id FROM pathways.system_users WHERE email = 'carlo.mendoza@pathways.example')"
  const loadProjects =
    "(SELECT p.*, row_number() OVER (ORDER BY p.code) AS n FROM pathways.projects p WHERE p.code LIKE 'LOAD-%')"
  return [
    `INSERT INTO pathways.projects (organization_id, code, title, status, start_date, end_date, created_by_id)
     SELECT ${org}, 'LOAD-' || g, 'Load project ' || g, 'ONGOING', '2026-01-01', '2026-12-31', ${user}
     FROM generate_series(1, ${s.projects}) g ON CONFLICT DO NOTHING`,
    `INSERT INTO pathways.user_project_assignments (organization_id, project_id, user_id, assigned_by_id)
     SELECT p.organization_id, p.id, ${me}, ${user} FROM pathways.projects p
     WHERE p.code LIKE 'LOAD-%' AND NOT EXISTS (SELECT 1 FROM pathways.user_project_assignments a
       WHERE a.project_id = p.id AND a.user_id = ${me} AND a.status = 'ACTIVE')`,
    `INSERT INTO pathways.beneficiaries (organization_id, code, display_name, created_by_id)
     SELECT ${org}, 'LOADB-' || g, 'Load beneficiary ' || g, ${user}
     FROM generate_series(1, ${s.beneficiaries}) g ON CONFLICT DO NOTHING`,
    `INSERT INTO pathways.beneficiary_project_enrollments (organization_id, project_id, beneficiary_id, enrollment_date, recorded_by_id)
     SELECT b.organization_id, p.id, b.id, DATE '2026-02-01' + (b.g::int % 120), ${user}
     FROM (SELECT b.*, row_number() OVER (ORDER BY b.code) AS g FROM pathways.beneficiaries b WHERE b.code LIKE 'LOADB-%') b
     JOIN ${loadProjects} p ON p.n = (b.g % ${s.projects}) + 1
     ON CONFLICT DO NOTHING`,
    `INSERT INTO pathways.beneficiary_journey_events (organization_id, project_id, enrollment_id, event_type, event_date, note, recorded_by_id)
     SELECT e.organization_id, e.project_id, e.id,
       (ARRAY['PARTICIPATION','PROGRESS_UPDATE','FOLLOW_UP','COMPLETION'])[1 + (g % 4)]::pathways."JourneyEventType",
       DATE '2026-03-01' + (g % 200), 'load-seed', ${user}
     FROM generate_series(1, ${s.events}) g
     JOIN (SELECT e.*, row_number() OVER (ORDER BY e.id) AS n FROM pathways.beneficiary_project_enrollments e
           WHERE e.beneficiary_id IN (SELECT id FROM pathways.beneficiaries WHERE code LIKE 'LOADB-%')) e
       ON e.n = (g % ${s.beneficiaries}) + 1
     WHERE NOT EXISTS (SELECT 1 FROM pathways.beneficiary_journey_events WHERE note = 'load-seed')`,
    `INSERT INTO pathways.project_indicators (organization_id, project_id, code, name, measurement_mode, numeric_kind, direction,
       display_precision, period_start, period_end, unit_label, data_source, target_value, created_by_id)
     SELECT p.organization_id, p.id, 'LOADI-' || g, 'Load indicator ' || g, 'MANUAL', 'COUNT', 'HIGHER_IS_BETTER',
       0, '2026-01-01', '2026-12-31', 'persons', 'synthetic load seed', 1000, ${user}
     FROM generate_series(1, ${s.indicators}) g
     JOIN ${loadProjects} p ON p.n = (g % ${s.projects}) + 1
     ON CONFLICT DO NOTHING`,
    `INSERT INTO pathways.project_indicator_measurements (organization_id, project_id, indicator_id, period_start, period_end,
       value, source, client_measurement_id, request_hash, recorded_by_id)
     SELECT i.organization_id, i.project_id, i.id, DATE '2026-01-01' + ((m - 1) * 28), DATE '2026-01-01' + (m * 28) - 1,
       m * 50, 'load-seed', gen_random_uuid(), md5(random()::text) || md5(random()::text), ${user}
     FROM pathways.project_indicators i CROSS JOIN generate_series(1, ${s.readings}) m
     WHERE i.code LIKE 'LOADI-%'
       AND NOT EXISTS (SELECT 1 FROM pathways.project_indicator_measurements x WHERE x.indicator_id = i.id)`,
  ]
}

async function main() {
  assertLocalDemoTarget(process.env)
  const owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
  try {
    for (const sql of loadSeedStatements()) await owner.$executeRawUnsafe(sql)
    const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
      "SELECT id FROM pathways.projects WHERE code = 'LOAD-1'",
    )
    console.info(`Load seed done. SADDD project for perf run: ${row?.id}`)
  } finally {
    await owner.$disconnect()
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
