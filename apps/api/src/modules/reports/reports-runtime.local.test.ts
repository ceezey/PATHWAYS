import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import { IndicatorsService } from '@app/modules/indicators/indicators.service'
import { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { type CanonicalRole, roleNames, rolePermissions } from '../auth/authorization-policy'
import { DashboardsService } from '../dashboards/dashboards.service'
import { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { ReportPdfRenderer } from '../report-pdf/report-pdf.renderer'
import { RulesHumanService } from '../rules/rules-human.service'
import type { StorageService } from '../storage/storage.service'
import { type ReportKind, reportKinds } from './reports.dto'
import { ReportsService } from './reports.service'

// Explicit opt-in only. Gate G-F12-1: report output respects role scope and suppression.
const enabled = process.env.PATHWAYS_REPORTS_LOCAL_TESTS === '1'
const replayPort = Number(process.env.PATHWAYS_REPLAY_PORT)
if (enabled && !replayPort) throw new Error('PATHWAYS_REPLAY_PORT is required')
const expectedPathwaysTableCount = Number(process.env.PATHWAYS_EXPECTED_TABLE_COUNT)
if (enabled && !expectedPathwaysTableCount)
  throw new Error('PATHWAYS_EXPECTED_TABLE_COUNT is required')
const id = (number: number) => `a5900000-0000-4000-8000-${String(number).padStart(12, '0')}`
const orgA = id(1)
const orgB = id(2)
const projectAssigned = id(3)
const projectUnassigned = id(4)
const projectOtherOrg = id(5)
const allowedKinds = reportKinds.filter((kind) => kind !== 'SURVEY_FORM_RESULTS')
const previewKeys = [
  'columns',
  'formId',
  'generatedAt',
  'kind',
  'projectId',
  'rows',
  'unavailableReasons',
]

const identities = new Map<CanonicalRole, ApplicationIdentity>()
const seedUser = async (
  tx: Prisma.TransactionClient,
  number: number,
  roleCode: CanonicalRole,
  assigned: string[],
) => {
  const authSubject = id(number)
  const userId = id(number + 1)
  const role = await tx.role.findUniqueOrThrow({ where: { code: roleCode }, select: { id: true } })
  await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${authSubject}::uuid)`
  await tx.systemUser.create({
    data: {
      id: userId,
      organizationId: orgA,
      roleId: role.id,
      authUserId: authSubject,
      fullName: `Synthetic ${roleCode}`,
      email: `reports-${number}@example.invalid`,
      accountStatus: 'ACTIVE',
      invitedAt: new Date('2026-09-01T00:00:00.000Z'),
      activatedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  })
  for (const [index, projectId] of assigned.entries())
    await tx.userProjectAssignment.create({
      data: {
        id: id(number + 2 + index),
        organizationId: orgA,
        projectId,
        userId,
        assignedById: userId,
      },
    })
  identities.set(roleCode, {
    id: authSubject,
    aal: 'aal2',
    organizationId: orgA,
    userId,
    fullName: `Synthetic ${roleCode}`,
    roles: [roleCode],
    permissions: [...rolePermissions[roleCode]],
    assignedProjectIds: assigned,
  })
}
const identityOf = (role: CanonicalRole) => {
  const identity = identities.get(role)
  if (!identity) throw new Error(`Missing fixture identity ${role}`)
  return identity
}

describe.skipIf(!enabled)('report preview scope and suppression on disposable PostgreSQL', () => {
  it('keeps preview inside role, project, organization and small-cell limits', async () => {
    const localUrl = new URL('postgresql://127.0.0.1')
    localUrl.username = 'postgres'
    localUrl.port = String(replayPort)
    localUrl.pathname = '/pathways_phase4_phase6_replay'
    localUrl.searchParams.set('schema', 'public')
    localUrl.searchParams.set('connection_limit', '1')
    localUrl.searchParams.set('connect_timeout', '5')
    const client = new PrismaService({ datasources: { db: { url: localUrl.toString() } } })
    const rollback = new Error('Reports synthetic fixture rollback')
    let completed = false

    try {
      const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_phase6_replay'
          AND inet_server_addr() = '127.0.0.1'::inet
          AND inet_server_port() = ${replayPort}
          AND current_user = 'postgres' AND session_user = 'postgres'
          AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='pathways' AND c.relkind='r') = ${expectedPathwaysTableCount} AS safe
      `
      expect(guard?.safe).toBe(true)

      try {
        await client.$transaction(
          async (tx) => {
            for (const role of ['PROJECT_MANAGER', 'PROGRAM_MANAGER', 'PROJECT_OFFICER'] as const) {
              const codes = [...rolePermissions[role]]
              await tx.role.upsert({
                where: { code: role },
                create: { code: role, name: roleNames[role] },
                update: { isActive: true },
              })
              await tx.$executeRaw`INSERT INTO pathways.permissions(code,name) SELECT c,c FROM unnest(${codes}::text[]) c ON CONFLICT (code) DO NOTHING`
              await tx.$executeRaw`INSERT INTO pathways.role_permissions(role_id,permission_id) SELECT r.id,p.id FROM pathways.roles r JOIN pathways.permissions p ON p.code = ANY(${codes}::text[]) WHERE r.code=${role} ON CONFLICT DO NOTHING`
            }
            // Seed as superuser without the runtime-only source-proof triggers.
            await tx.$executeRaw`SET LOCAL session_replication_role = replica`
            await tx.organization.create({
              data: { id: orgA, code: 'RPT_LOCAL_A', name: 'Synthetic report organization A' },
            })
            await tx.organization.create({
              data: { id: orgB, code: 'RPT_LOCAL_B', name: 'Synthetic report organization B' },
            })
            await seedUser(tx, 10, 'PROJECT_MANAGER', [projectAssigned])
            await seedUser(tx, 20, 'PROGRAM_MANAGER', [projectAssigned])
            await seedUser(tx, 30, 'PROJECT_OFFICER', [projectAssigned])
            const creator = identityOf('PROJECT_MANAGER').userId
            for (const [projectId, organizationId, code] of [
              [projectAssigned, orgA, 'RPT-ASSIGNED'],
              [projectUnassigned, orgA, 'RPT-UNASSIGNED'],
              [projectOtherOrg, orgB, 'RPT-OTHER-ORG'],
            ] as const)
              await tx.project.create({
                data: {
                  id: projectId,
                  organizationId,
                  code,
                  title: `Synthetic closed project ${code}`,
                  startDate: new Date('2026-01-01T00:00:00.000Z'),
                  endDate: new Date('2026-07-31T00:00:00.000Z'),
                  ...(organizationId === orgA ? { createdById: creator } : {}),
                },
              })
            await tx.projectActivity.create({
              data: {
                id: id(40),
                organizationId: orgA,
                projectId: projectAssigned,
                code: 'RPT-ACT-1',
                title: 'Synthetic report activity',
                plannedStartDate: new Date('2026-01-01T00:00:00.000Z'),
                plannedEndDate: new Date('2026-07-31T00:00:00.000Z'),
                createdById: creator,
              },
            })
            await tx.projectIndicator.create({
              data: {
                id: id(41),
                organizationId: orgA,
                projectId: projectAssigned,
                code: 'RPT-IND-1',
                name: 'Synthetic report indicator',
                unitLabel: 'records',
                dataSource: 'Synthetic manual source',
                measurementMode: 'MANUAL',
                numericKind: 'COUNT',
                direction: 'HIGHER_IS_BETTER',
                displayPrecision: 0,
                periodStart: new Date('2026-01-01T00:00:00.000Z'),
                periodEnd: new Date('2026-07-31T00:00:00.000Z'),
                baselineValue: 0,
                targetValue: 10,
                createdById: creator,
              },
            })
            const pm = identityOf('PROJECT_MANAGER')
            await tx.$queryRaw`
              SELECT set_config('request.jwt.claim.sub', ${pm.id}, true),
                set_config('app.organization_id', ${orgA}, true),
                set_config('app.user_id', ${pm.userId}, true)
            `
            // Three enrolled individuals: every SADDD cell holds 1 to 4 people.
            for (const [index, sex] of (['FEMALE', 'FEMALE', 'MALE'] as const).entries()) {
              const beneficiaryId = id(50 + index)
              await tx.beneficiary.create({
                data: {
                  id: beneficiaryId,
                  organizationId: orgA,
                  code: `RPT-BEN-${index}`,
                  subjectType: 'INDIVIDUAL',
                  firstName: 'Synthetic',
                  lastName: 'Person',
                  sex,
                  birthDate: new Date('2020-06-30T00:00:00.000Z'),
                  disabilityStatus: 'WITH_DISABILITY',
                  consentRecorded: true,
                  dataProcessingConsentRecorded: true,
                  isMinor: true,
                  guardianConsentRecorded: true,
                  createdById: creator,
                },
              })
              await tx.beneficiaryProjectEnrollment.create({
                data: {
                  id: id(60 + index),
                  organizationId: orgA,
                  projectId: projectAssigned,
                  beneficiaryId,
                  enrollmentDate: new Date('2026-01-01T00:00:00.000Z'),
                  recordedById: creator,
                },
              })
            }

            // Test-only adapter reuses the rollback transaction; authorization, RLS and scope stay real.
            const scoped = Object.create(PrismaService.prototype) as PrismaService
            Object.defineProperty(scoped, '$transaction', {
              value: (work: (inner: Prisma.TransactionClient) => Promise<unknown>) => work(tx),
            })
            const indicators = new IndicatorsService(scoped)
            const dashboards = new DashboardsService(scoped, indicators)
            const reports = new ReportsService(
              scoped,
              {} as StorageService,
              dashboards,
              // The runtime test keep pdfkit output deterministic by disabling the Chromium renderer.
              {
                render: () => Promise.reject(new Error('PDF renderer disabled.')),
              } as unknown as ReportPdfRenderer,
              new ProjectOverviewMetricsService(scoped, indicators, dashboards),
              new RulesHumanService(scoped),
            )
            await tx.$executeRaw`SET LOCAL session_replication_role = origin`
            // The indicator report SQL also requires session_user to be the runtime role.
            await tx.$executeRaw`SET LOCAL SESSION AUTHORIZATION pathways_runtime`
            const preview = (role: CanonicalRole, projectId: string, kind: ReportKind) =>
              reports.preview(identityOf(role), projectId, { kind })

            // 1. Assigned Project Manager receives rows for every non-survey kind but evaluation.
            for (const kind of allowedKinds.filter((value) => value !== 'EVALUATION_REPORT')) {
              const result = await preview('PROJECT_MANAGER', projectAssigned, kind)
              expect(result.rows.length, `assigned PM ${kind} returns rows`).toBeGreaterThan(0)
              expect(result.projectId, `assigned PM ${kind} echoes its project`).toBe(
                projectAssigned,
              )
            }
            const summary = await preview('PROJECT_MANAGER', projectAssigned, 'PROJECT_SUMMARY')
            expect(summary.rows[0]?.[0], 'project summary is the assigned project').toBe(
              'RPT-ASSIGNED',
            )
            const indicator = await preview('PROJECT_MANAGER', projectAssigned, 'INDICATOR_SUMMARY')
            expect(
              indicator.rows.map((row) => row[0]),
              'indicator summary lists only the assigned project indicator',
            ).toEqual(['RPT-IND-1'])

            // 2. Same organization, not assigned: every kind is out of scope.
            for (const kind of allowedKinds)
              await expect(
                preview('PROJECT_MANAGER', projectUnassigned, kind),
                `unassigned project ${kind} is rejected`,
              ).rejects.toBeInstanceOf(NotFoundException)

            // 3. Other organization: every kind is out of scope.
            for (const kind of allowedKinds)
              await expect(
                preview('PROJECT_MANAGER', projectOtherOrg, kind),
                `other organization project ${kind} is rejected`,
              ).rejects.toBeInstanceOf(NotFoundException)

            // 4. Missing per-kind permission is forbidden, not empty.
            await expect(
              preview('PROGRAM_MANAGER', projectAssigned, 'BENEFICIARY_SUMMARY'),
              'no reports.beneficiary.read is forbidden for BENEFICIARY_SUMMARY',
            ).rejects.toThrow(new ForbiddenException('Current report permission required.'))
            for (const kind of ['MONITORING_REPORT', 'EVALUATION_REPORT'] as const)
              await expect(
                preview('PROJECT_OFFICER', projectAssigned, kind),
                `no monitoring.read is forbidden for ${kind}`,
              ).rejects.toThrow(new ForbiddenException('Current report permission required.'))

            // 5. Suppression: no count between 1 and 4 may leave the trusted aggregate.
            const saddd = await preview('PROJECT_MANAGER', projectAssigned, 'BENEFICIARY_SUMMARY')
            expect(saddd.rows.length, 'SADDD preview returns its cells').toBeGreaterThan(1)
            expect(
              saddd.rows.filter((row) => /^[1-4]$/.test(row[2] ?? '')),
              'no SADDD cell shows a count of 1 to 4',
            ).toEqual([])
            expect(
              saddd.rows.find((row) => row[0] === 'Total')?.slice(2, 4),
              'SADDD total of three is suppressed',
            ).toEqual(['Not available', 'SUPPRESSED'])
            const monitoring = await preview(
              'PROJECT_MANAGER',
              projectAssigned,
              'MONITORING_REPORT',
            )
            // The trusted monitoring aggregate withholds participation counts from every role.
            const participation = monitoring.rows.filter((row) => row[0] === 'Participation')
            expect(
              participation.length,
              'monitoring report lists participation rows',
            ).toBeGreaterThan(0)
            expect(
              participation.filter((row) => /^\d+$/.test(row[2] ?? '')),
              'monitoring report withholds every participation count',
            ).toEqual([])

            // 6. No signed-off evaluation: empty rows, a reason, and only allowlisted keys.
            const evaluation = await preview(
              'PROJECT_MANAGER',
              projectAssigned,
              'EVALUATION_REPORT',
            )
            expect(evaluation.rows, 'evaluation without sign-off has no rows').toEqual([])
            expect(evaluation.unavailableReasons, 'evaluation without sign-off states why').toEqual(
              ['No signed-off evaluation is available for this project.'],
            )
            expect(Object.keys(evaluation).sort(), 'preview exposes only allowlisted keys').toEqual(
              previewKeys,
            )

            completed = true
            throw rollback
          },
          { timeout: 90_000 },
        )
      } catch (error) {
        if (error !== rollback) throw error
      }
      expect(completed).toBe(true)
    } finally {
      await client.$disconnect()
    }
  }, 120_000)
})
