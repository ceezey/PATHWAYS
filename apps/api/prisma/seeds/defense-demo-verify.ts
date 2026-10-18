import type { PrismaClient } from '@prisma/client'

import { lastMonthIso, monthStartIso } from './defense-demo-stage-backdate'
import { addDaysIso } from './local-demo-data'
import { type StaffKey, manilaToday } from './local-demo-seed'
import type { RuntimeTx } from './local-demo-util'

type Check = { check: string; ok: boolean; detail: string; skipped?: true }

/** Runs a read as one staff member; tables with forced row level security hide rows from the owner. */
type Scoped = <T>(as: StaffKey, run: (tx: RuntimeTx) => Promise<T>) => Promise<T>

/** Read-only checks that the defense dataset has everything the walkthrough needs. */
export async function verifyDefenseDemo(
  owner: PrismaClient,
  scoped: Scoped,
  today = manilaToday(),
) {
  const checks: Check[] = []
  const add = (check: string, ok: boolean, detail: string) => checks.push({ check, ok, detail })
  const skip = (check: string, detail: string) =>
    checks.push({ check, ok: true, detail: `skipped: ${detail}`, skipped: true })
  const one = async (query: Promise<Array<{ n: bigint | number }>>) => Number((await query)[0].n)
  const thisMonth = monthStartIso(today)
  const lastMonth = lastMonthIso(today)

  const projects = await owner.project.findMany({
    select: { code: true, status: true, startDate: true, endDate: true },
  })
  const project = (prefix: string) => projects.find((row) => row.code.startsWith(prefix))
  const day = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? ''
  const ehk = project('EHK')
  add(
    'EHK is completed and closed',
    ehk?.status === 'COMPLETED' && day(ehk.endDate) < today,
    `${ehk?.status} ends ${day(ehk?.endDate)}`,
  )
  const ecd = project('ECD')
  add(
    'ECD is planned and starts in the future',
    ecd?.status === 'PLANNED' && day(ecd.startDate) > today,
    `${ecd?.status} starts ${day(ecd?.startDate)}`,
  )
  const wsh = project('WSH')
  add(
    'WSH is ongoing past its end date',
    wsh?.status === 'ONGOING' && day(wsh.endDate) < today,
    `${wsh?.status} ends ${day(wsh?.endDate)}`,
  )

  const statuses = await owner.projectActivity.groupBy({
    by: ['status'],
    where: { archivedAt: null },
    _count: { _all: true },
  })
  const counts = Object.fromEntries(statuses.map((row) => [row.status, row._count._all]))
  const overdue = await owner.projectActivity.count({
    where: {
      archivedAt: null,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      plannedEndDate: { lt: new Date(`${today}T00:00:00.000Z`) },
    },
  })
  add(
    'activity outcomes are mixed',
    ['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED', 'CANCELLED'].every((key) => counts[key] > 0),
    `${JSON.stringify(counts)}, overdue open ${overdue}`,
  )
  add('at least two activities are overdue and open', overdue >= 2, `${overdue} overdue`)
  const soon = await owner.projectActivity.count({
    where: {
      archivedAt: null,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      plannedEndDate: {
        gte: new Date(`${today}T00:00:00.000Z`),
        lte: new Date(`${addDaysIso(today, 2)}T00:00:00.000Z`),
      },
    },
  })
  add('no open activity falls due in the next two days', soon === 0, `${soon} due soon`)

  const [proofs, stored] = await scoped('me', async (tx) => [
    await tx.activityUpdate.count({ where: { status: 'PENDING' } }),
    await one(tx.$queryRaw`SELECT count(DISTINCT u.id) AS n
      FROM pathways.activity_updates u JOIN pathways.evidence_media m ON m.activity_update_id = u.id
      WHERE u.status = 'PENDING' AND m.storage_ready`),
  ])
  add(
    'a pending proof with stored evidence waits for review',
    stored > 0,
    `${proofs} pending, ${stored} with stored files`,
  )

  const verified = await owner.budgetExpenseEntry.count({ where: { status: 'VERIFIED' } })
  add('a verified expense waits for the Project Manager', verified > 0, `${verified} verified`)
  const unsigned =
    await one(owner.$queryRaw`SELECT count(*) AS n FROM pathways.budget_expense_entries e
    WHERE e.status = 'APPROVED' AND NOT EXISTS (SELECT 1 FROM pathways.expense_signoffs s WHERE s.expense_id = e.id)`)
  add('an approved expense waits for sign-off', unsigned > 0, `${unsigned} approved and unsigned`)
  const rejected = await owner.budgetExpenseEntry.findMany({
    where: { status: 'REJECTED' },
    select: { rejectionReason: true },
  })
  add(
    'rejected expenses carry reasons',
    rejected.length >= 2 && rejected.every((row) => (row.rejectionReason ?? '').length > 10),
    `${rejected.length} rejected`,
  )

  const misdated =
    await one(owner.$queryRaw`SELECT count(*) AS n FROM pathways.budget_expense_entries e
    JOIN pathways.projects p ON p.id = e.project_id
    LEFT JOIN pathways.project_budget_records b ON b.id = e.budget_record_id
    LEFT JOIN pathways.project_activities a ON a.id = b.activity_id
    WHERE e.expense_date < p.start_date OR (p.end_date IS NOT NULL AND e.expense_date > p.end_date AND p.status = 'COMPLETED')
      OR e.expense_date < a.planned_start_date - 14
      OR (a.status = 'COMPLETED' AND e.expense_date > a.planned_end_date + 45)`)
  add(
    'expense dates fall inside the project and after the activity planned start and not long after it ended',
    misdated === 0,
    `${misdated} misdated`,
  )
  const types = await owner.projectIndicator.groupBy({
    by: ['indicatorType'],
    where: { archivedAt: null },
  })
  add(
    'every indicator type is present',
    types.length === 7,
    types.map((row) => row.indicatorType).join(', '),
  )
  const unlinked = await one(owner.$queryRaw`SELECT count(*) AS n FROM pathways.project_indicators i
    WHERE i.archived_at IS NULL AND EXISTS (SELECT 1 FROM pathways.project_indicator_measurements m WHERE m.indicator_id = i.id)
      AND i.code ~ '^(SSG|CRL|ALS|WSH|EHK)-' AND NOT EXISTS (SELECT 1 FROM pathways.activity_indicator_links l WHERE l.indicator_id = i.id)`)
  add(
    'every seeded indicator with readings is linked to an activity',
    unlinked === 0,
    `${unlinked} unlinked`,
  )
  const library = await scoped('me', (tx) =>
    tx.indicatorLibraryEntry.count({ where: { archivedAt: null } }),
  )
  add('the indicator library has entries', library >= 2, `${library} entries`)
  const derived = await scoped('me', (tx) =>
    tx.projectIndicatorBinding.count({ where: { recipe: 'ACTIVITY_COMPLETION_PERCENTAGE' } }),
  )
  add(
    'a derived indicator is bound to the activity completion recipe',
    derived > 0,
    `${derived} bound`,
  )

  const periods = await owner.projectIndicator.findMany({
    where: { archivedAt: null, project: { code: { startsWith: 'WSH' } } },
    distinct: ['periodStart', 'periodEnd'],
    select: { periodStart: true, periodEnd: true },
  })
  const [period] = periods
  const pairs = period
    ? await one(owner.$queryRaw`SELECT count(*) AS n FROM pathways.assessment_results pre
      JOIN pathways.assessment_results post ON post.enrollment_id = pre.enrollment_id
        AND post.type = 'POST_TEST' AND post.project_id = pre.project_id
      JOIN pathways.projects p ON p.id = pre.project_id AND p.code LIKE 'WSH%'
      WHERE pre.type = 'PRE_TEST'
        AND pre.assessment_date BETWEEN ${period.periodStart}::date AND ${period.periodEnd}::date
        AND post.assessment_date BETWEEN ${period.periodStart}::date AND ${period.periodEnd}::date`)
    : 0
  add(
    'WSH has one closed survey period with at least five pairs',
    periods.length === 1 && day(period?.periodEnd) < today && pairs >= 5,
    `${periods.length} period ending ${day(period?.periodEnd)}, ${pairs} pairs`,
  )

  const respondents = await one(owner.$queryRaw`SELECT coalesce(max(c), 0) AS n FROM (
    SELECT count(DISTINCT s.beneficiary_id) AS c
    FROM pathways.digital_forms f
    JOIN pathways.form_submissions s ON s.form_id = f.id AND s.status = 'VALIDATED' AND NOT s.is_dummy_record
    JOIN pathways.beneficiary_project_enrollments e ON e.beneficiary_id = s.beneficiary_id
      AND e.project_id = s.project_id AND e.status = 'ACTIVE' AND e.ended_date IS NULL
    JOIN pathways.beneficiaries b ON b.id = s.beneficiary_id AND b.subject_type = 'INDIVIDUAL'
      AND b.consent_recorded AND b.data_processing_consent_recorded AND b.archived_at IS NULL
    WHERE f.form_type = 'TRAINING_SURVEY' AND f.status = 'PUBLISHED'
    GROUP BY f.id) t`)
  add(
    'a published survey has at least five eligible respondents',
    respondents >= 5,
    `${respondents} respondents`,
  )

  const signed = await owner.projectEvaluation.count({
    where: { status: 'SIGNED_OFF', project: { code: { startsWith: 'EHK' } } },
  })
  add('the EHK evaluation is signed off', signed > 0, `${signed} signed off`)
  const published = await scoped('projectManager', (tx) =>
    tx.projectPublication.count({ where: { state: 'PUBLISHED' } }),
  )
  add('a project is published on the public tracker', published > 0, `${published} published`)

  const start = new Date(`${thisMonth}T00:00:00.000Z`)
  const participation = await owner.beneficiaryActivityParticipation.count({
    where: { participationDate: { gte: start } },
  })
  const submissions = await owner.formSubmission.count({ where: { submittedAt: { gte: start } } })
  add(
    'this month has participation and submissions',
    participation > 0 && submissions > 0,
    `${participation} participation, ${submissions} submissions`,
  )

  const batches = await owner.dataImportBatch.findMany({
    select: { status: true, invalidRows: true, uploadedAt: true, processedAt: true },
  })
  const inMonth = (value: Date | null, from: string, to: string) =>
    Boolean(value) && day(value) >= from && day(value) < to
  const earlier = batches.filter((row) =>
    inMonth(row.processedAt, monthStartIso(lastMonth), thisMonth),
  )
  const partial = batches.filter(
    (row) =>
      row.status === 'PARTIALLY_PROCESSED' &&
      row.invalidRows > 0 &&
      day(row.uploadedAt) >= thisMonth,
  )
  add('an import batch is from last month', earlier.length > 0, `${earlier.length} batches`)
  add(
    'a partially processed batch with rejected rows is from this month',
    partial.length > 0,
    `${partial.length} batches`,
  )

  const severities = await owner.ruleBasedAlert.groupBy({
    by: ['severity'],
    _count: { _all: true },
  })
  if (severities.length === 0) {
    for (const name of [
      'alerts include high and medium severity',
      'an alert was auto-resolved',
      'a recommendation was escalated',
    ])
      skip(name, 'rule evaluation did not run')
  } else {
    const present = severities.map((row) => row.severity)
    add(
      'alerts include high and medium severity',
      ['HIGH', 'MEDIUM'].every((s) => present.includes(s as never)),
      present.join(', '),
    )
    const auto = await owner.decisionRecommendation.count({ where: { status: 'AUTO_RESOLVED' } })
    add('an alert was auto-resolved', auto > 0, `${auto} recommendations auto-resolved`)
    // Rule decisions live in the internal ledger, so read the outcome from the decision audit trail.
    const escalated = await owner.auditLog.count({
      where: { action: 'decision.recorded', changes: { path: ['outcome'], equals: 'ESCALATE' } },
    })
    add('a recommendation was escalated', escalated > 0, `${escalated} escalated`)
  }
  return checks
}
