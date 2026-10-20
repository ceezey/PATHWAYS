import { describe, expect, it } from 'vitest'

import { reportKinds } from '../../constants/domain-codes'
import {
  evaluationCriterionResponse,
  evaluationDetailResponse,
  evaluationsResponse,
} from '../evaluations/evaluation-responses'
import {
  budgetReferenceResponse,
  budgetResponse,
  budgetWriteResponse,
  expenseAcknowledgementResponse,
  expenseResponse,
  expenseSignoffResponse,
} from '../finance/finance-responses'
import {
  evaluationRoundResponse,
  generateReportResponse,
  reportPreviewResponse,
  reportResponse,
  surveyFormResponse,
} from '../reports/report-responses'

const id = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'
const day = '2026-09-01'
const expenseStatuses = ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']
const evaluationStatuses = ['DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED']
const limits = (limit: number, ...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, limit]))

// What one response object must keep: required and nullable fields, formats, enum members and bounds.
type Rules = {
  schema: { safeParse: (value: unknown) => { success: boolean } }
  sample: Record<string, unknown>
  wrap?: (value: unknown) => unknown
  nullable?: string[]
  optional?: string[]
  uuids?: string[]
  times?: string[]
  decimals?: string[]
  dates?: string[]
  booleans?: string[]
  integers?: string[]
  positive?: string[]
  enums?: Record<string, readonly string[]>
  literals?: Record<string, [unknown, unknown]>
  max?: Record<string, number>
  arrays?: Record<string, number>
  numbers?: Record<string, [number, number]>
}

const pin = (name: string, rules: Rules) =>
  it(`pins every rule of ${name}`, () => {
    const { schema, sample, wrap = (value: unknown) => value } = rules
    const parses = (value: Record<string, unknown>) => schema.safeParse(wrap(value)).success
    const check = (key: string, value: unknown, expected: boolean) =>
      expect(parses({ ...sample, [key]: value }), `${name}.${key} = ${JSON.stringify(value)}`).toBe(
        expected,
      )
    expect(parses(sample), `${name} sample`).toBe(true)
    expect(parses({ ...sample, unknownKey: 1 }), `${name} unknown key`).toBe(false)
    for (const key of Object.keys(sample)) {
      check(key, null, rules.nullable?.includes(key) ?? false)
      const { [key]: _omitted, ...rest } = sample
      expect(parses(rest), `${name}.${key} absent`).toBe(rules.optional?.includes(key) ?? false)
    }
    for (const key of rules.uuids ?? []) check(key, 'not-a-uuid', false)
    for (const key of rules.times ?? []) {
      check(key, '2026-09-01T08:00:00+08:00', true)
      for (const bad of ['yesterday', day]) check(key, bad, false)
    }
    for (const key of rules.decimals ?? []) {
      for (const good of ['-5', '5', '0.50']) check(key, good, true)
      for (const bad of ['1e3', '1,5', '', '1.', '.5', ' 5']) check(key, bad, false)
    }
    for (const key of rules.dates ?? [])
      for (const bad of [stamp, '26-09-01', '2026-9-1']) check(key, bad, false)
    for (const key of rules.booleans ?? []) check(key, 'yes', false)
    for (const key of rules.integers ?? []) check(key, 1.5, false)
    for (const key of rules.positive ?? []) for (const bad of [0, -1]) check(key, bad, false)
    for (const [key, members] of Object.entries(rules.enums ?? {})) {
      for (const member of members) check(key, member, true)
      check(key, 'ZZ', false)
    }
    for (const [key, [good, bad]] of Object.entries(rules.literals ?? {})) {
      check(key, good, true)
      check(key, bad, false)
    }
    for (const [key, limit] of Object.entries(rules.max ?? {})) {
      check(key, 'x'.repeat(limit), true)
      check(key, 'x'.repeat(limit + 1), false)
    }
    for (const [key, limit] of Object.entries(rules.arrays ?? {})) {
      const item = (sample[key] as unknown[])[0]
      check(key, Array(limit).fill(item), true)
      check(key, Array(limit + 1).fill(item), false)
    }
    for (const [key, [low, high]] of Object.entries(rules.numbers ?? {})) {
      for (const good of [low, high]) check(key, good, true)
      for (const bad of [low - 1, high + 1, Number.POSITIVE_INFINITY, 'x']) check(key, bad, false)
    }
  })

describe('finance response rules', () => {
  pin('budgetResponse', {
    schema: budgetResponse,
    sample: {
      id,
      activityId: id,
      category: 'Training',
      currency: 'PHP',
      plannedBudget: '1500.00',
      remarks: 'Note',
      updatedAt: stamp,
    },
    nullable: ['activityId', 'remarks'],
    uuids: ['id', 'activityId'],
    times: ['updatedAt'],
    decimals: ['plannedBudget'],
  })
  pin('budgetWriteResponse', {
    schema: budgetWriteResponse,
    sample: { id, updatedAt: stamp },
    uuids: ['id'],
    times: ['updatedAt'],
  })
  pin('budgetReferenceResponse', {
    schema: budgetReferenceResponse,
    sample: { id, category: 'Training', activityId: id },
    nullable: ['activityId'],
    uuids: ['id', 'activityId'],
  })
  pin('expenseResponse', {
    schema: expenseResponse,
    sample: {
      id,
      budgetRecordId: id,
      description: 'Venue',
      amount: '250.00',
      expenseDate: day,
      status: 'PENDING',
      receiptEvidenceId: id,
      submittedById: id,
      verifiedById: id,
      approvedById: id,
      updatedAt: stamp,
      signedOffById: id,
      signedOffAt: stamp,
      submittedByName: 'Fictional Officer',
      verifiedByName: 'Fictional Verifier',
      approvedByName: 'Fictional Approver',
      signedOffByName: 'Fictional Signer',
    },
    nullable: [
      'receiptEvidenceId',
      'verifiedById',
      'approvedById',
      'signedOffById',
      'signedOffAt',
      'submittedByName',
      'verifiedByName',
      'approvedByName',
      'signedOffByName',
    ],
    uuids: [
      'id',
      'budgetRecordId',
      'receiptEvidenceId',
      'submittedById',
      'verifiedById',
      'approvedById',
      'signedOffById',
    ],
    times: ['updatedAt', 'signedOffAt'],
    decimals: ['amount'],
    enums: { status: expenseStatuses },
    max: limits(200, 'submittedByName', 'verifiedByName', 'approvedByName', 'signedOffByName'),
  })
  pin('expenseAcknowledgementResponse', {
    schema: expenseAcknowledgementResponse,
    sample: { id, projectId: id, status: 'VERIFIED', updatedAt: stamp, receiptEvidenceId: id },
    nullable: ['receiptEvidenceId'],
    uuids: ['id', 'projectId', 'receiptEvidenceId'],
    times: ['updatedAt'],
    enums: { status: expenseStatuses },
  })
  pin('expenseSignoffResponse', {
    schema: expenseSignoffResponse,
    sample: { expenseId: id, signedOffById: id, signedOffAt: stamp },
    uuids: ['expenseId', 'signedOffById'],
    times: ['signedOffAt'],
  })
})

describe('evaluation response rules', () => {
  const snapshot = {
    id,
    code: 'RELEVANCE',
    version: 1,
    type: 'KPI',
    name: 'Relevance',
    description: 'Note',
    weight_percentage: '25',
    maximum_score: '100',
  }
  const score = {
    criterionId: id,
    score: '80',
    maximumScore: '100',
    weightedScore: '20',
    source: 'computed',
    evidence: 'From the indicators',
    reason: 'Reason',
    note: 'Note',
    criterion: snapshot,
  }
  const person = { id, name: 'Fictional Officer' }
  const detail = {
    id,
    title: 'Mid-term',
    periodLabel: 'First half',
    periodStart: '2026-01-01',
    periodEnd: '2026-06-30',
    overallScore: '71.08',
    commentary: 'Notes',
    returnReason: 'Redo',
    status: 'DRAFT',
    updatedAt: stamp,
    evaluatedBy: person,
    evaluatedAt: stamp,
    reviewedBy: person,
    reviewedAt: stamp,
    reviewFeedback: 'Fine',
    signedOffBy: person,
    signedOffAt: stamp,
    scores: [score],
  }
  const criterion = {
    id,
    code: 'RELEVANCE',
    name: 'Relevance',
    description: 'Note',
    type: 'KPI',
    version: 1,
    weightPercentage: '25',
    maximumScore: '100',
    status: 'PUBLISHED',
    updatedAt: stamp,
  }
  pin('evaluationCriterionResponse', {
    schema: evaluationCriterionResponse,
    sample: criterion,
    nullable: ['description'],
    uuids: ['id'],
    times: ['updatedAt'],
    decimals: ['weightPercentage', 'maximumScore'],
    integers: ['version'],
    enums: {
      type: [
        'KPI',
        'TIMELINE_COMPLIANCE',
        'BUDGET_EFFICIENCY',
        'BENEFICIARY_REACH',
        'INDICATOR_LINKAGE',
        'ASSESSMENT_GAIN',
        'OTHER',
      ],
      status: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    },
  })
  pin('the criterion snapshot of a score', {
    schema: evaluationDetailResponse,
    sample: snapshot,
    wrap: (value) => ({ ...detail, scores: [{ ...score, criterion: value }] }),
    nullable: ['description'],
    uuids: ['id'],
    integers: ['version'],
  })
  pin('the score of an evaluation', {
    schema: evaluationDetailResponse,
    sample: score,
    wrap: (value) => ({ ...detail, scores: [value] }),
    nullable: ['evidence', 'reason', 'note'],
    uuids: ['criterionId'],
    decimals: ['score', 'maximumScore', 'weightedScore'],
    enums: { source: ['computed', 'no_data', 'manual'] },
  })
  pin('the person of an evaluation', {
    schema: evaluationDetailResponse,
    sample: person,
    wrap: (value) => ({ ...detail, evaluatedBy: value }),
    uuids: ['id'],
  })
  pin('evaluationDetailResponse', {
    schema: evaluationDetailResponse,
    sample: detail,
    nullable: [
      'periodLabel',
      'overallScore',
      'commentary',
      'returnReason',
      'evaluatedBy',
      'evaluatedAt',
      'reviewedBy',
      'reviewedAt',
      'reviewFeedback',
      'signedOffBy',
      'signedOffAt',
    ],
    uuids: ['id'],
    times: ['updatedAt', 'evaluatedAt', 'reviewedAt', 'signedOffAt'],
    decimals: ['overallScore'],
    enums: { status: evaluationStatuses },
    arrays: { scores: 100 },
  })
  pin('evaluationsResponse', {
    schema: evaluationsResponse,
    sample: { projectId: id, criteria: [criterion], evaluations: [detail], hasMore: true },
    uuids: ['projectId'],
    booleans: ['hasMore'],
    arrays: { criteria: 100, evaluations: 20 },
  })
})

describe('report response rules', () => {
  const sections = {
    reportDate: day,
    information: {
      code: 'P-1',
      title: 'Recorded project',
      status: 'ACTIVE',
      sector: 'Health',
      area: 'Region',
      startDate: day,
      endDate: day,
      partners: 'Partner',
      manager: 'Fictional Manager',
    },
    overview: [{ area: 'Schedule', status: 'ON_TRACK', comment: 'On plan' }],
    keyFigures: [
      {
        label: 'Beneficiaries',
        state: 'AVAILABLE',
        value: '10',
        reason: 'Counted',
        detail: 'Reached',
        percent: 50,
      },
    ],
    budget: [
      {
        line: 'Training',
        currency: 'PHP',
        planned: '100',
        approved: '50',
        inReview: '20',
        remaining: '30',
      },
    ],
    milestones: [
      { title: 'Kickoff', status: 'DONE', targetDate: day, completionDate: day, overdue: false },
    ],
    indicators: [
      {
        code: 'I-1',
        name: 'Households',
        baseline: '0',
        target: '10',
        current: '5',
        progress: '50%',
      },
    ],
    alerts: [{ title: 'Behind', severity: 'LOW', explanation: 'Slow', evaluatedAt: stamp }],
  }
  const preview = {
    projectId: id,
    kind: 'PROJECT_SUMMARY',
    formId: id,
    columns: ['Title'],
    rows: [['Recorded project']],
    sections,
    generatedAt: stamp,
    unavailableReasons: ['None'],
  }
  const report = {
    id,
    name: 'Summary',
    type: 'PROJECT_SUMMARY',
    format: 'PDF',
    status: 'GENERATED',
    generatedAt: stamp,
    evaluation: { title: 'Mid-term', periodStart: '2026-01-01', periodEnd: '2026-06-30' },
  }
  const inSections = (change: (value: unknown) => object) => (value: unknown) => ({
    ...preview,
    sections: { ...sections, ...change(value) },
  })

  pin('the sections of a preview', {
    schema: reportPreviewResponse,
    sample: sections,
    wrap: (value) => ({ ...preview, sections: value }),
    optional: ['keyFigures', 'budget', 'milestones', 'indicators', 'alerts'],
    max: { reportDate: 40 },
    arrays: {
      overview: 10,
      keyFigures: 10,
      budget: 50,
      milestones: 100,
      indicators: 50,
      alerts: 10,
    },
  })
  pin('the information of a preview', {
    schema: reportPreviewResponse,
    sample: sections.information,
    wrap: inSections((value) => ({ information: value })),
    nullable: ['manager'],
    max: limits(
      2000,
      'code',
      'title',
      'status',
      'sector',
      'area',
      'startDate',
      'endDate',
      'partners',
      'manager',
    ),
  })
  pin('an overview row', {
    schema: reportPreviewResponse,
    sample: sections.overview[0],
    wrap: inSections((value) => ({ overview: [value] })),
    enums: { status: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_AVAILABLE'] },
    max: limits(2000, 'area', 'comment'),
  })
  pin('a key figure', {
    schema: reportPreviewResponse,
    sample: sections.keyFigures[0],
    wrap: inSections((value) => ({ keyFigures: [value] })),
    nullable: ['value', 'reason', 'percent'],
    enums: { state: ['AVAILABLE', 'ZERO', 'MISSING', 'NOT_APPLICABLE', 'SUPPRESSED'] },
    max: limits(2000, 'label', 'value', 'reason', 'detail'),
    numbers: { percent: [-100000, 100000] },
  })
  pin('a budget row', {
    schema: reportPreviewResponse,
    sample: sections.budget[0],
    wrap: inSections((value) => ({ budget: [value] })),
    max: { ...limits(2000, 'line', 'planned', 'approved', 'inReview', 'remaining'), currency: 3 },
  })
  pin('a milestone', {
    schema: reportPreviewResponse,
    sample: sections.milestones[0],
    wrap: inSections((value) => ({ milestones: [value] })),
    nullable: ['targetDate', 'completionDate'],
    booleans: ['overdue'],
    max: { title: 2000, status: 2000, targetDate: 40, completionDate: 40 },
  })
  pin('an indicator row', {
    schema: reportPreviewResponse,
    sample: sections.indicators[0],
    wrap: inSections((value) => ({ indicators: [value] })),
    nullable: ['baseline', 'target'],
    max: limits(2000, 'code', 'name', 'baseline', 'target', 'current', 'progress'),
  })
  pin('an alert', {
    schema: reportPreviewResponse,
    sample: sections.alerts[0],
    wrap: inSections((value) => ({ alerts: [value] })),
    nullable: ['severity'],
    enums: { severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    max: { title: 2000, explanation: 2000, evaluatedAt: 40 },
  })
  pin('reportPreviewResponse', {
    schema: reportPreviewResponse,
    sample: preview,
    nullable: ['formId'],
    optional: ['sections'],
    uuids: ['projectId', 'formId'],
    times: ['generatedAt'],
    enums: { kind: reportKinds },
    arrays: { columns: 30, rows: 1000, unavailableReasons: 20 },
  })
  pin('reportResponse', {
    schema: reportResponse,
    sample: report,
    nullable: ['format', 'generatedAt', 'evaluation'],
    uuids: ['id'],
    times: ['generatedAt'],
    enums: {
      type: [...reportKinds, 'OTHER'],
      format: ['CSV', 'XLSX', 'XLS', 'PDF'],
      status: ['DRAFT', 'GENERATED', 'ARCHIVED'],
    },
  })
  pin('the evaluation of a saved report', {
    schema: reportResponse,
    sample: report.evaluation,
    wrap: (value) => ({ ...report, evaluation: value }),
    dates: ['periodStart', 'periodEnd'],
  })
  pin('evaluationRoundResponse', {
    schema: evaluationRoundResponse,
    sample: {
      id,
      title: 'Mid-term',
      status: 'SIGNED_OFF',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      signedOffAt: stamp,
      overallScore: '71.08',
    },
    nullable: ['signedOffAt', 'overallScore'],
    uuids: ['id'],
    times: ['signedOffAt'],
    dates: ['periodStart', 'periodEnd'],
    decimals: ['overallScore'],
    enums: { status: evaluationStatuses },
  })
  pin('surveyFormResponse', {
    schema: surveyFormResponse,
    sample: { id, name: 'Survey', code: 'S', version: 1 },
    uuids: ['id'],
    integers: ['version'],
    positive: ['version'],
  })
  pin('generateReportResponse', {
    schema: generateReportResponse,
    sample: { id, status: 'GENERATED', pdfFallback: true },
    optional: ['pdfFallback'],
    uuids: ['id'],
    literals: { status: ['GENERATED', 'DRAFT'], pdfFallback: [true, false] },
  })

  it('bounds the rows and the cells of a preview', () => {
    const parses = (rows: unknown) => reportPreviewResponse.safeParse({ ...preview, rows }).success
    expect(parses([Array(30).fill('x'.repeat(2000))])).toBe(true)
    expect(parses([Array(31).fill('x')])).toBe(false)
    expect(parses([['x'.repeat(2001)]])).toBe(false)
  })
})
