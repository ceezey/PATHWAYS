import { describe, expect, it } from 'vitest'

import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import type { SurveyAggregateResultSet, SurveyFormDefinition } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

import {
  buildSurveyReportRows,
  findSurveyResult,
  getFirstSurveySelection,
  getSurveyFormsForProject,
  getSurveyLocations,
  getSurveyPrograms,
  getSurveyProjectIds,
  getSurveyResponseDates,
} from './survey-report-utils'

// These compact records are isolated to tests and are never bundled as runtime fallback data.
const testSurveyForms: SurveyFormDefinition[] = [
  {
    id: 'form-alpha',
    title: 'Training Feedback',
    formType: 'Training Survey',
    programName: 'Program Alpha',
    projectId: 'project-alpha',
    journeyStageId: 'stage-alpha',
    activityId: 'activity-alpha',
    source: 'Metadata-driven Collection import',
    fields: [
      {
        id: 'field-confidence',
        label: 'Confidence after training',
        responseType: 'Single select',
        metadataKey: 'training_confidence',
        required: true,
        options: ['Confident', 'Needs support'],
      },
      {
        id: 'field-score',
        label: 'Knowledge score',
        responseType: 'Numeric score',
        metadataKey: 'knowledge_score',
        required: true,
        minimum: 0,
        maximum: 100,
      },
    ],
  },
  {
    id: 'form-beta',
    title: 'Readiness Check',
    formType: 'Pre/Post Assessment',
    programName: 'Program Beta',
    projectId: 'project-beta',
    fields: [
      {
        id: 'field-readiness',
        label: 'Activity readiness',
        responseType: 'Single select',
        metadataKey: 'activity_readiness',
        required: true,
        options: ['Ready', 'Needs support'],
      },
    ],
    source: 'Metadata-driven Collection import',
  },
]

const testSurveyResults: SurveyAggregateResultSet[] = [
  {
    id: 'result-alpha',
    formId: 'form-alpha',
    projectId: 'project-alpha',
    location: 'City Alpha',
    responseDate: '2026-07-15',
    reportingPeriod: '2026 Q3',
    responseCount: 10,
    source: 'Synthetic aggregate mock',
    questionResults: [
      {
        fieldId: 'field-confidence',
        kind: 'Categorical distribution',
        responseCount: 10,
        values: [
          { label: 'Confident', count: 6 },
          { label: 'Needs support', count: 4 },
        ],
      },
      {
        fieldId: 'field-score',
        kind: 'Numeric summary',
        responseCount: 10,
        average: 82,
        minimum: 55,
        maximum: 100,
        scaleLabel: 'out of 100',
      },
    ],
    demographicBreakdowns: [
      {
        dimension: 'Sex',
        values: [
          { label: 'Female', count: 5 },
          { label: 'Male', count: 5 },
        ],
      },
    ],
  },
  {
    id: 'result-beta',
    formId: 'form-beta',
    projectId: 'project-beta',
    location: 'City Beta',
    responseDate: '2026-06-28',
    reportingPeriod: '2026 Q2',
    responseCount: 10,
    source: 'Synthetic aggregate mock',
    questionResults: [
      {
        fieldId: 'field-readiness',
        kind: 'Categorical distribution',
        responseCount: 10,
        values: [
          { label: 'Ready', count: 5 },
          { label: 'Needs support', count: 5 },
        ],
      },
    ],
    demographicBreakdowns: [
      {
        dimension: 'Age group',
        values: [
          { label: '15-17', count: 5 },
          { label: '18-24', count: 5 },
        ],
      },
    ],
  },
]

describe('survey report helpers', () => {
  const assignedProjectIds: Partial<Record<PathwaysRole, readonly string[]>> = {
    'Project Manager': ['project-alpha'],
    'Project Officer': ['project-alpha'],
    'Monitoring and Evaluation Officer': ['project-alpha', 'project-beta'],
  }

  it.each([
    ['Project Manager', ['project-alpha']],
    ['Project Officer', ['project-alpha']],
    ['Monitoring and Evaluation Officer', ['project-alpha', 'project-beta']],
    ['Program Manager', ['project-alpha', 'project-beta']],
    ['Grant Manager', ['project-alpha', 'project-beta']],
    ['System Administrator', ['project-alpha', 'project-beta']],
  ] as const)('limits %s Survey/Form filters to visible project scope', (role, expectedIds) => {
    const visibleFormProjectIds = [
      ...new Set(
        testSurveyForms
          .filter((form) =>
            canAccessProjectForRole(role, form.projectId, assignedProjectIds[role] ?? []),
          )
          .map((form) => form.projectId),
      ),
    ]
    const visibleResultProjectIds = [
      ...new Set(
        testSurveyResults
          .filter((result) =>
            canAccessProjectForRole(role, result.projectId, assignedProjectIds[role] ?? []),
          )
          .map((result) => result.projectId),
      ),
    ]

    expect(visibleFormProjectIds).toEqual(expectedIds)
    expect(visibleResultProjectIds).toEqual(expectedIds)
  })

  it('derives internally connected filter options from form metadata and result sets', () => {
    expect(getSurveyPrograms(testSurveyForms)).toEqual(['Program Alpha', 'Program Beta'])
    expect(getSurveyProjectIds(testSurveyForms, 'Program Alpha')).toEqual(['project-alpha'])
    expect(
      getSurveyFormsForProject(testSurveyForms, 'Program Alpha', 'project-alpha').map(
        (form) => form.title,
      ),
    ).toEqual(['Training Feedback'])
    expect(getSurveyLocations(testSurveyResults, 'form-alpha')).toEqual(['City Alpha'])
    expect(getSurveyResponseDates(testSurveyResults, 'form-alpha', 'City Alpha')).toEqual([
      '2026-07-15',
    ])
  })

  it('selects and resolves the first connected aggregate result', () => {
    const selection = getFirstSurveySelection('form-alpha', testSurveyResults)
    const result = findSurveyResult(testSurveyResults, selection)

    expect(selection).toEqual({
      formId: 'form-alpha',
      location: 'City Alpha',
      responseDate: '2026-07-15',
    })
    expect(result).toMatchObject({ reportingPeriod: '2026 Q3', responseCount: 10 })
  })

  it('builds aggregate question rows without Beneficiary identity fields', () => {
    const rows = buildSurveyReportRows(testSurveyForms[0], testSurveyResults[0])

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: 'Confidence after training',
          resultType: 'Categorical distribution',
          responses: 10,
        }),
        expect.objectContaining({
          question: 'Knowledge score',
          summary: 'Average 82 out of 100; range 55-100',
        }),
      ]),
    )
    expect(JSON.stringify({ forms: testSurveyForms, results: testSurveyResults })).not.toMatch(
      /beneficiaryId|beneficiaryCode|firstName|lastName|birthDate|barangay/i,
    )
  })

  it('keeps aggregate counts and metadata relationships internally consistent', () => {
    for (const result of testSurveyResults) {
      const form = testSurveyForms.find((candidate) => candidate.id === result.formId)

      expect(form?.projectId).toBe(result.projectId)
      for (const question of result.questionResults) {
        expect(form?.fields.some((field) => field.id === question.fieldId)).toBe(true)
        expect(question.responseCount).toBe(result.responseCount)
        if (question.kind === 'Categorical distribution') {
          expect(question.values.reduce((total, value) => total + value.count, 0)).toBe(
            result.responseCount,
          )
        }
      }
      for (const breakdown of result.demographicBreakdowns) {
        expect(breakdown.values.reduce((total, value) => total + value.count, 0)).toBe(
          result.responseCount,
        )
        expect(breakdown.values.every((value) => value.count >= 5)).toBe(true)
      }
    }
  })

  it('returns an empty report when no aggregate result matches', () => {
    expect(
      findSurveyResult(testSurveyResults, {
        formId: 'form-alpha',
        location: 'City Alpha',
        responseDate: '2025-01-01',
      }),
    ).toBeUndefined()
    expect(buildSurveyReportRows(testSurveyForms[0], undefined)).toEqual([])
  })
})
