import type { SurveyAggregateResultSet, SurveyFormDefinition } from '@/types/pathways'

export const mockSurveyForms: SurveyFormDefinition[] = [
  {
    id: 'form-life-skills-training',
    title: 'Life Skills Training Survey',
    formType: 'Training Survey',
    programName: 'FutureMakers',
    projectId: 'futuremakers-ncr',
    journeyStageId: 'stage-vocational',
    activityId: 'act-fm-02',
    source: 'Metadata-driven Collection prototype',
    fields: [
      {
        id: 'field-confidence',
        label: 'Confidence applying life skills',
        responseType: 'Single select',
        metadataKey: 'life_skills_confidence',
        required: true,
        options: ['Very confident', 'Somewhat confident', 'Needs more practice'],
      },
      {
        id: 'field-skills-score',
        label: 'Life skills knowledge score',
        responseType: 'Numeric score',
        metadataKey: 'life_skills_score',
        required: true,
        minimum: 0,
        maximum: 100,
      },
      {
        id: 'field-useful-module',
        label: 'Most useful training module',
        responseType: 'Single select',
        metadataKey: 'most_useful_module',
        required: true,
        options: ['Job readiness', 'Digital basics', 'Entrepreneurship'],
      },
    ],
  },
  {
    id: 'form-community-readiness',
    title: 'Community Readiness Survey',
    formType: 'Pre/Post Assessment',
    programName: 'Youth RISE',
    projectId: 'youth-rise-western-samar',
    journeyStageId: 'stage-yr-entry',
    activityId: 'act-yr-01',
    source: 'Metadata-driven Collection prototype',
    fields: [
      {
        id: 'field-readiness',
        label: 'Readiness to join scheduled activities',
        responseType: 'Single select',
        metadataKey: 'activity_readiness',
        required: true,
        options: ['Ready', 'Needs support', 'Not ready'],
      },
      {
        id: 'field-readiness-score',
        label: 'Readiness score',
        responseType: 'Numeric score',
        metadataKey: 'readiness_score',
        required: true,
        minimum: 1,
        maximum: 5,
      },
    ],
  },
]

export const mockSurveyAggregateResults: SurveyAggregateResultSet[] = [
  {
    id: 'survey-result-life-skills-navotas-2026-07-15',
    formId: 'form-life-skills-training',
    projectId: 'futuremakers-ncr',
    location: 'Navotas',
    responseDate: '2026-07-15',
    reportingPeriod: '2026 Q3',
    responseCount: 40,
    source: 'Synthetic aggregate mock',
    questionResults: [
      {
        fieldId: 'field-confidence',
        kind: 'Categorical distribution',
        responseCount: 40,
        values: [
          { label: 'Very confident', count: 18 },
          { label: 'Somewhat confident', count: 16 },
          { label: 'Needs more practice', count: 6 },
        ],
      },
      {
        fieldId: 'field-skills-score',
        kind: 'Numeric summary',
        responseCount: 40,
        average: 82,
        minimum: 55,
        maximum: 100,
        scaleLabel: 'out of 100',
      },
      {
        fieldId: 'field-useful-module',
        kind: 'Categorical distribution',
        responseCount: 40,
        values: [
          { label: 'Job readiness', count: 15 },
          { label: 'Digital basics', count: 14 },
          { label: 'Entrepreneurship', count: 11 },
        ],
      },
    ],
    demographicBreakdowns: [
      {
        dimension: 'Sex',
        values: [
          { label: 'Female', count: 21 },
          { label: 'Male', count: 14 },
          { label: 'Prefer not to say', count: 5 },
        ],
      },
      {
        dimension: 'Age group',
        values: [
          { label: '15-17', count: 10 },
          { label: '18-24', count: 22 },
          { label: '25+', count: 8 },
        ],
      },
    ],
  },
  {
    id: 'survey-result-life-skills-quezon-city-2026-06-30',
    formId: 'form-life-skills-training',
    projectId: 'futuremakers-ncr',
    location: 'Quezon City',
    responseDate: '2026-06-30',
    reportingPeriod: '2026 Q2',
    responseCount: 32,
    source: 'Synthetic aggregate mock',
    questionResults: [
      {
        fieldId: 'field-confidence',
        kind: 'Categorical distribution',
        responseCount: 32,
        values: [
          { label: 'Very confident', count: 12 },
          { label: 'Somewhat confident', count: 15 },
          { label: 'Needs more practice', count: 5 },
        ],
      },
      {
        fieldId: 'field-skills-score',
        kind: 'Numeric summary',
        responseCount: 32,
        average: 78,
        minimum: 50,
        maximum: 96,
        scaleLabel: 'out of 100',
      },
      {
        fieldId: 'field-useful-module',
        kind: 'Categorical distribution',
        responseCount: 32,
        values: [
          { label: 'Job readiness', count: 13 },
          { label: 'Digital basics', count: 10 },
          { label: 'Entrepreneurship', count: 9 },
        ],
      },
    ],
    demographicBreakdowns: [
      {
        dimension: 'Sex',
        values: [
          { label: 'Female', count: 17 },
          { label: 'Male', count: 10 },
          { label: 'Prefer not to say', count: 5 },
        ],
      },
      {
        dimension: 'Age group',
        values: [
          { label: '15-17', count: 8 },
          { label: '18-24', count: 18 },
          { label: '25+', count: 6 },
        ],
      },
    ],
  },
  {
    id: 'survey-result-readiness-calbayog-2026-06-28',
    formId: 'form-community-readiness',
    projectId: 'youth-rise-western-samar',
    location: 'Calbayog',
    responseDate: '2026-06-28',
    reportingPeriod: '2026 Q2',
    responseCount: 28,
    source: 'Synthetic aggregate mock',
    questionResults: [
      {
        fieldId: 'field-readiness',
        kind: 'Categorical distribution',
        responseCount: 28,
        values: [
          { label: 'Ready', count: 16 },
          { label: 'Needs support', count: 7 },
          { label: 'Not ready', count: 5 },
        ],
      },
      {
        fieldId: 'field-readiness-score',
        kind: 'Numeric summary',
        responseCount: 28,
        average: 3.9,
        minimum: 2,
        maximum: 5,
        scaleLabel: 'out of 5',
      },
    ],
    demographicBreakdowns: [
      {
        dimension: 'Sex',
        values: [
          { label: 'Female', count: 13 },
          { label: 'Male', count: 10 },
          { label: 'Prefer not to say', count: 5 },
        ],
      },
      {
        dimension: 'Age group',
        values: [
          { label: '15-17', count: 15 },
          { label: '18-24', count: 8 },
          { label: '25+', count: 5 },
        ],
      },
    ],
  },
]
