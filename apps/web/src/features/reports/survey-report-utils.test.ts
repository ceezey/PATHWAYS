import { describe, expect, it } from 'vitest'

import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { mockSurveyAggregateResults, mockSurveyForms } from '@/mocks/pathways'
import type { PrototypeRole } from '@/types/prototype-role'

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

describe('survey report helpers', () => {
  it.each([
    ['Project Manager', ['futuremakers-ncr']],
    ['Project Officer', ['futuremakers-ncr']],
    ['Monitoring and Evaluation Officer', ['futuremakers-ncr']],
    ['Program Manager', ['futuremakers-ncr', 'youth-rise-western-samar']],
    ['Grant Manager', ['futuremakers-ncr', 'youth-rise-western-samar']],
    ['System Administrator', ['futuremakers-ncr', 'youth-rise-western-samar']],
  ] as const)('limits %s Survey/Form filters to visible project scope', (role, expectedIds) => {
    const visibleFormProjectIds = [
      ...new Set(
        mockSurveyForms
          .filter((form) => canAccessProjectForRole(role as PrototypeRole, form.projectId))
          .map((form) => form.projectId),
      ),
    ]
    const visibleResultProjectIds = [
      ...new Set(
        mockSurveyAggregateResults
          .filter((result) => canAccessProjectForRole(role as PrototypeRole, result.projectId))
          .map((result) => result.projectId),
      ),
    ]

    expect(visibleFormProjectIds).toEqual(expectedIds)
    expect(visibleResultProjectIds).toEqual(expectedIds)
  })

  it('derives internally connected filter options from form metadata and result sets', () => {
    expect(getSurveyPrograms(mockSurveyForms)).toEqual(['FutureMakers', 'Youth RISE'])
    expect(getSurveyProjectIds(mockSurveyForms, 'FutureMakers')).toEqual(['futuremakers-ncr'])
    expect(
      getSurveyFormsForProject(mockSurveyForms, 'FutureMakers', 'futuremakers-ncr').map(
        (form) => form.title,
      ),
    ).toEqual(['Life Skills Training Survey'])
    expect(getSurveyLocations(mockSurveyAggregateResults, 'form-life-skills-training')).toEqual([
      'Navotas',
      'Quezon City',
    ])
    expect(
      getSurveyResponseDates(mockSurveyAggregateResults, 'form-life-skills-training', 'Navotas'),
    ).toEqual(['2026-07-15'])
  })

  it('resolves the required Life Skills, FutureMakers, Navotas, and exact-date scenario', () => {
    const form = mockSurveyForms[0]
    const selection = getFirstSurveySelection(form.id, mockSurveyAggregateResults)
    const result = findSurveyResult(mockSurveyAggregateResults, selection)

    expect(form).toMatchObject({
      title: 'Life Skills Training Survey',
      programName: 'FutureMakers',
      projectId: 'futuremakers-ncr',
      journeyStageId: 'stage-vocational',
      activityId: 'act-fm-02',
    })
    expect(selection).toEqual({
      formId: 'form-life-skills-training',
      location: 'Navotas',
      responseDate: '2026-07-15',
    })
    expect(result).toMatchObject({ reportingPeriod: '2026 Q3', responseCount: 40 })
  })

  it('builds aggregate question rows without Beneficiary identity fields', () => {
    const form = mockSurveyForms[0]
    const result = mockSurveyAggregateResults[0]
    const rows = buildSurveyReportRows(form, result)

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: 'Confidence applying life skills',
          resultType: 'Categorical distribution',
          responses: 40,
        }),
        expect.objectContaining({
          question: 'Life skills knowledge score',
          summary: 'Average 82 out of 100; range 55-100',
        }),
      ]),
    )
    expect(
      JSON.stringify({ forms: mockSurveyForms, results: mockSurveyAggregateResults }),
    ).not.toMatch(/beneficiaryId|beneficiaryCode|firstName|lastName|birthDate|barangay/i)
  })

  it('keeps aggregate counts and metadata relationships internally consistent', () => {
    for (const result of mockSurveyAggregateResults) {
      const form = mockSurveyForms.find((candidate) => candidate.id === result.formId)

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
      findSurveyResult(mockSurveyAggregateResults, {
        formId: 'form-life-skills-training',
        location: 'Navotas',
        responseDate: '2025-01-01',
      }),
    ).toBeUndefined()
    expect(buildSurveyReportRows(mockSurveyForms[0], undefined)).toEqual([])
  })
})
