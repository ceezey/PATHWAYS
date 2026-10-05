import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { EvaluationMetricsService } from './evaluation-metrics'
import { EvaluationsService } from './evaluations.service'

const enabled = process.env.PATHWAYS_EVALUATIONS_LOCAL_TESTS === '1'
const replayPort = Number(process.env.PATHWAYS_REPLAY_PORT)
if (enabled && !replayPort) throw new Error('PATHWAYS_REPLAY_PORT is required')
const id = (number: number) => `a9640000-0000-4000-8000-${String(number).padStart(12, '0')}`
const organizationId = id(1)
const projectId = id(2)
const people = [
  { n: 2, role: 'MONITORING_AND_EVALUATION_OFFICER', name: 'Evaluation M&E' },
  { n: 3, role: 'PROJECT_MANAGER', name: 'Evaluation manager' },
  { n: 4, role: 'MONITORING_AND_EVALUATION_OFFICER', name: 'Second evaluation M&E' },
  { n: 5, role: 'PROGRAM_MANAGER', name: 'Evaluation program manager' },
] as const
const identity = (n: number): ApplicationIdentity => ({
  id: id(200 + n),
  aal: 'aal2',
  organizationId,
  userId: id(100 + n),
  fullName: 'Synthetic',
  roles: [],
  permissions: [],
  assignedProjectIds: [projectId],
})
const clientUrl = (user: string) => {
  const url = new URL('postgresql://127.0.0.1')
  url.username = user
  url.port = String(replayPort)
  url.pathname = '/pathways_phase4_phase6_replay'
  url.searchParams.set('schema', 'public')
  url.searchParams.set('connection_limit', '1')
  url.searchParams.set('connect_timeout', '5')
  return url.toString()
}
const reason = 'Scores need a clearer note.'

describe.skipIf(!enabled)('evaluation write path on disposable PostgreSQL', () => {
  let owner: PrismaService
  let runtime: PrismaService
  let service: EvaluationsService
  let evaluationId = ''

  const current = async (id = evaluationId) => {
    const detail = await service.get(identity(2), projectId)
    const row = detail.evaluations.find((evaluation) => evaluation.id === id)
    if (!row) throw new Error('Evaluation fixture is missing.')
    return row
  }
  // Runs raw SQL under one user's session so RLS and triggers see that user.
  const asUser = <T>(n: number, work: Parameters<PrismaService['withVerifiedContext']>[1]) =>
    runtime.withVerifiedContext(
      { authSubject: id(200 + n), organizationId, userId: id(100 + n) },
      work as never,
    ) as Promise<T>
  const failure = async (attempt: Promise<unknown>) => {
    try {
      await attempt
    } catch (error) {
      return String((error as Error).message)
    }
    throw new Error('Expected the statement to be rejected.')
  }

  beforeAll(async () => {
    owner = new PrismaService({ datasources: { db: { url: clientUrl('postgres') } } })
    runtime = new PrismaService({ datasources: { db: { url: clientUrl('pathways_runtime') } } })
    const [guard] = await owner.$queryRaw<Array<{ safe: boolean }>>`
      SELECT current_database() = 'pathways_phase4_phase6_replay'
        AND inet_server_addr() = '127.0.0.1'::inet
        AND inet_server_port() = ${replayPort}
        AND to_regclass('pathways.project_evaluations') IS NOT NULL AS safe
    `
    expect(guard?.safe).toBe(true)
    const [login] = await runtime.$queryRaw<Array<{ safe: boolean }>>`
      SELECT current_user = 'pathways_runtime' AND session_user = 'pathways_runtime' AS safe
    `
    expect(login?.safe).toBe(true)
    // Only criteria of type OTHER are scored, so the computed-metrics service is never reached.
    const metrics = { computeMany: async () => new Map() } as unknown as EvaluationMetricsService
    service = new EvaluationsService(runtime, metrics)

    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`
      await tx.organization.create({
        data: { id: organizationId, code: 'EVAL_LOCAL', name: 'Evaluation local organization' },
      })
      for (const person of people) {
        await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${id(200 + person.n)}::uuid)`
        const role = await tx.role.findUniqueOrThrow({ where: { code: person.role } })
        await tx.systemUser.create({
          data: {
            id: id(100 + person.n),
            organizationId,
            roleId: role.id,
            authUserId: id(200 + person.n),
            fullName: person.name,
            email: `evaluation-${person.n}@example.invalid`,
            accountStatus: 'ACTIVE',
            invitedAt: new Date('2026-09-01T00:00:00.000Z'),
            activatedAt: new Date('2026-09-01T00:00:00.000Z'),
          },
        })
      }
      await tx.project.create({
        data: {
          id: projectId,
          organizationId,
          code: 'EVAL-LOCAL',
          title: 'Evaluation project',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
          createdById: id(103),
        },
      })
      for (const person of people) {
        await tx.userProjectAssignment.create({
          data: {
            id: id(300 + person.n),
            organizationId,
            projectId,
            userId: id(100 + person.n),
            assignedById: id(103),
          },
        })
      }
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await owner?.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL session_replication_role = replica`
        const tables = await tx.$queryRaw<Array<{ table_name: string }>>`
          SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'pathways' AND column_name = 'organization_id'
            AND table_name <> 'organizations'`
        for (const { table_name } of tables)
          await tx.$executeRawUnsafe(
            `DELETE FROM pathways."${table_name.replace(/"/g, '')}" WHERE organization_id = $1::uuid`,
            organizationId,
          )
        await tx.$executeRaw`DELETE FROM pathways.organizations WHERE id = ${organizationId}::uuid`
        await tx.$executeRaw`DELETE FROM auth.users WHERE id::text LIKE 'a9640000-%'`
      })
    } finally {
      await runtime?.$disconnect()
      await owner?.$disconnect()
    }
  }, 30_000)

  it('lets the M&E officer create and publish criteria, start, score and submit', async () => {
    const created = await service.createCriteria(identity(2), projectId, {
      clientRequestId: id(901),
      criteria: [
        { code: 'REL', name: 'Relevance', type: 'OTHER', weightPercentage: 60, maximumScore: 100 },
        { code: 'COH', name: 'Coherence', type: 'OTHER', weightPercentage: 40, maximumScore: 100 },
      ],
    })
    await service.publishCriteria(identity(2), projectId, {
      criteria: created.criteria.map((row) => ({ id: row.id, expectedUpdatedAt: row.updatedAt })),
    })
    const started = await service.createEvaluation(identity(2), projectId, {
      clientRequestId: id(902),
      title: 'Mid-term evaluation',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
    })
    evaluationId = started.id
    expect(started.status).toBe('DRAFT')
    const scored = await service.saveScores(identity(2), projectId, evaluationId, {
      expectedUpdatedAt: started.updatedAt,
      commentary: 'Evaluator narrative.',
      scores: created.criteria.map((row) => ({
        criterionId: row.id,
        manualScore: 80,
        note: 'Judged against the work plan.',
      })),
    })
    const submitted = await service.submit(identity(2), projectId, evaluationId, {
      expectedUpdatedAt: scored.updatedAt,
    })
    expect(submitted.status).toBe('SUBMITTED')
    expect(submitted.evaluatedBy?.id).toBe(id(102))
    expect(submitted.overallScore).toBe('80')
  })

  it('lets the project manager return it with a reason, clearing submission state', async () => {
    const before = await current()
    const returned = await service.returnToDraft(identity(3), projectId, evaluationId, {
      expectedUpdatedAt: before.updatedAt,
      reason,
    })
    expect(returned.status).toBe('DRAFT')
    expect(returned.evaluatedAt).toBeNull()
    expect(returned.overallScore).toBeNull()
    expect(returned.returnReason).toBe(reason)
    expect(returned.commentary).toBe('Evaluator narrative.')
  })

  it('rejects a project manager draft edit with 23514', async () => {
    const message = await failure(
      asUser(
        3,
        (tx) =>
          tx.$executeRaw`UPDATE pathways.project_evaluations SET title = 'PM edit' WHERE id = ${evaluationId}::uuid`,
      ),
    )
    expect(message).toContain('23514')
    expect(message).toContain('Draft evaluation edits require evaluations.submit')
    expect((await current()).title).toBe('Mid-term evaluation')
  })

  it('lets the M&E officer edit commentary on the draft', async () => {
    const before = await current()
    const edited = await service.saveScores(identity(2), projectId, evaluationId, {
      expectedUpdatedAt: before.updatedAt,
      commentary: 'Clarified the notes.',
      scores: before.scores.map((row) => ({
        criterionId: row.criterionId,
        manualScore: 80,
        note: 'Judged against the work plan, clarified.',
      })),
    })
    expect(edited.status).toBe('DRAFT')
    expect(edited.commentary).toBe('Clarified the notes.')
    expect(edited.returnReason).toBe(reason)
  })

  it('rejects a second M&E officer submitting without taking over evaluated_by_id', async () => {
    const message = await failure(
      asUser(
        4,
        (tx) =>
          tx.$executeRaw`UPDATE pathways.project_evaluations SET status = 'SUBMITTED', evaluated_at = now() WHERE id = ${evaluationId}::uuid`,
      ),
    )
    expect(message).toContain('42501')
    expect(message).toContain('row-level security')
    const row = await current()
    expect(row.status).toBe('DRAFT')
    expect(row.evaluatedBy?.id).toBe(id(102))
  })

  it('resubmits and lets the project manager review and sign off in one action', async () => {
    const before = await current()
    const submitted = await service.submit(identity(2), projectId, evaluationId, {
      expectedUpdatedAt: before.updatedAt,
    })
    expect(submitted.status).toBe('SUBMITTED')
    expect(submitted.returnReason).toBeNull()
    // The evaluator cannot return their own submission either, even by raw SQL.
    const selfReturn = await failure(
      asUser(
        2,
        (tx) =>
          tx.$executeRaw`UPDATE pathways.project_evaluations SET status = 'DRAFT', evaluated_at = NULL, overall_score = NULL, return_reason = 'Self return' WHERE id = ${evaluationId}::uuid`,
      ),
    )
    expect(selfReturn).toContain('Returning an evaluation requires evaluations.approve')
    // The evaluator cannot review or sign off their own evaluation, by service or by raw SQL.
    await expect(
      service.signoff(identity(2), projectId, evaluationId, {
        expectedUpdatedAt: submitted.updatedAt,
        feedback: 'Self sign-off.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    const selfReview = await failure(
      asUser(
        2,
        (tx) =>
          tx.$executeRaw`UPDATE pathways.project_evaluations SET status = 'REVIEWED', reviewed_by_id = ${id(102)}::uuid, reviewed_at = now(), review_feedback = 'Self review' WHERE id = ${evaluationId}::uuid`,
      ),
    )
    expect(selfReview).toMatch(/23514|42501/)
    const unchanged = await current()
    expect(unchanged.status).toBe('SUBMITTED')
    expect(unchanged.reviewedBy).toBeNull()
    expect(unchanged.signedOffBy).toBeNull()
    expect(unchanged.updatedAt).toBe(submitted.updatedAt)
    const signed = await service.signoff(identity(3), projectId, evaluationId, {
      expectedUpdatedAt: submitted.updatedAt,
      feedback: 'Reviewed and accepted.',
    })
    expect(signed.status).toBe('SIGNED_OFF')
    expect(signed.reviewedBy?.id).toBe(id(103))
    expect(signed.signedOffBy?.id).toBe(id(103))
  })

  it('lets the program manager read but forbids every write', async () => {
    const detail = await service.get(identity(5), projectId)
    expect(detail.evaluations[0]?.status).toBe('SIGNED_OFF')
    expect(detail.evaluations[0]?.scores.length).toBe(2)
    const stamp = detail.evaluations[0]?.updatedAt ?? ''
    const writes = [
      service.createCriteria(identity(5), projectId, {
        clientRequestId: id(903),
        criteria: [
          { code: 'X', name: 'X', type: 'OTHER', weightPercentage: 100, maximumScore: 100 },
        ],
      }),
      service.createEvaluation(identity(5), projectId, {
        clientRequestId: id(904),
        title: 'Blocked',
        periodStart: '2026-07-01',
        periodEnd: '2026-12-31',
      }),
      service.saveScores(identity(5), projectId, evaluationId, {
        expectedUpdatedAt: stamp,
        scores: [{ criterionId: id(1), manualScore: 1, note: 'x' }],
      }),
      service.submit(identity(5), projectId, evaluationId, { expectedUpdatedAt: stamp }),
      service.returnToDraft(identity(5), projectId, evaluationId, {
        expectedUpdatedAt: stamp,
        reason,
      }),
      service.signoff(identity(5), projectId, evaluationId, {
        expectedUpdatedAt: stamp,
        feedback: 'x',
      }),
    ]
    for (const result of await Promise.allSettled(writes)) {
      expect(result.status).toBe('rejected')
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(ForbiddenException)
    }
    const after = await service.get(identity(5), projectId)
    expect(after.evaluations).toHaveLength(1)
    expect(after.evaluations[0]?.status).toBe('SIGNED_OFF')
    expect(after.evaluations[0]?.scores).toHaveLength(2)
    expect(after.evaluations[0]?.reviewedBy?.id).toBe(id(103))
    expect(after.evaluations[0]?.signedOffBy?.id).toBe(id(103))
    expect(after.evaluations[0]?.updatedAt).toBe(stamp)
  })

  it('lets a second M&E officer submit once it has taken over evaluated_by_id', async () => {
    const { criteria } = await service.get(identity(2), projectId)
    const started = await service.createEvaluation(identity(2), projectId, {
      clientRequestId: id(905),
      title: 'Final evaluation',
      periodStart: '2026-07-01',
      periodEnd: '2026-12-31',
    })
    const scored = await service.saveScores(identity(2), projectId, started.id, {
      expectedUpdatedAt: started.updatedAt,
      scores: criteria.map((row) => ({
        criterionId: row.id,
        manualScore: 70,
        note: 'Judged against the work plan.',
      })),
    })
    await asUser(
      4,
      (tx) =>
        tx.$executeRaw`UPDATE pathways.project_evaluations SET evaluated_by_id = ${id(104)}::uuid WHERE id = ${started.id}::uuid`,
    )
    const taken = await current(started.id)
    expect(taken.status).toBe('DRAFT')
    expect(taken.evaluatedBy?.id).toBe(id(104))
    const submitted = await service.submit(identity(4), projectId, started.id, {
      expectedUpdatedAt: taken.updatedAt,
    })
    expect(scored.status).toBe('DRAFT')
    expect(submitted.status).toBe('SUBMITTED')
    expect(submitted.evaluatedBy?.id).toBe(id(104))
  })
})
