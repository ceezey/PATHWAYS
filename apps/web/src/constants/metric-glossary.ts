/**
 * Plain-language wording for the monitoring and evaluation terms shown on the Indicators
 * and Monitoring & Evaluation tabs. One place, so a label and its hint never drift apart.
 */
export const metricGlossary = {
  measurementSource: 'Where this number came from: the form, report or record you read it off.',
  sourceDescription:
    'Where this indicator will be measured from each time, written once when it is set up.',
  exactValue: 'The number as recorded, with no rounding. It is stored exactly as typed.',
  correctionReason: 'Why an earlier value is being changed. The original value is kept beside it.',
  baseline: 'The value before the project started, used to judge how much has changed.',
  target: 'The value the project aims to reach by the end of the period.',
  actual: 'The latest value recorded against this indicator.',
  indicatorStatus:
    'How the latest value compares with the target. It is a reading, not a project grade.',
  criterion: 'One thing an evaluation judges the project on, such as whether it reached people.',
  weight:
    'How much this criterion counts toward the overall score. All weights add up to 100 percent.',
  score: 'The points this criterion earned out of its maximum, worked out from the project data.',
  scoreSource:
    'What the score was based on: the project data used, or the reason no data was available.',
  maximumScore: 'The highest score this criterion can be given, before its weight is applied.',
  weightedScore: 'The score after its weight is applied. These add up to the overall score.',
  noteOrFormula:
    'For a computed criterion, the calculation behind the score. For a manual one, the reason the evaluator gave it.',
  overallScore:
    'All weighted scores added together. It summarises the round, it does not rank the project.',
} as const

/** OECD-DAC style criteria and the computed criterion types, in everyday words. */
const criterionTerms: Record<string, { label: string; description: string }> = {
  RELEVANCE: {
    label: 'Relevance',
    description: 'Whether the project addresses what the community actually needs.',
  },
  COHERENCE: {
    label: 'Coherence',
    description: 'How well the project fits alongside other work in the same area.',
  },
  EFFECTIVENESS: {
    label: 'Effectiveness',
    description: 'Whether the project achieved what it set out to achieve.',
  },
  EFFICIENCY: {
    label: 'Efficiency',
    description: 'Whether the results were worth the time and money they took.',
  },
  IMPACT: {
    label: 'Impact',
    description: 'The wider difference the project made, beyond its own targets.',
  },
  SUSTAINABILITY: {
    label: 'Sustainability',
    description: 'Whether the benefits are likely to last after the project ends.',
  },
  KPI: {
    label: 'KPI',
    description:
      'Average progress of this project indicators toward their targets, calculated by the system.',
  },
  TIMELINE_COMPLIANCE: {
    label: 'Timeline compliance',
    description: 'How much of the planned schedule has passed, calculated by the system.',
  },
  BUDGET_EFFICIENCY: {
    label: 'Budget efficiency',
    description:
      'Indicator achievement set against how much of the budget was used, calculated by the system.',
  },
  BENEFICIARY_REACH: {
    label: 'Beneficiary reach',
    description: 'How many people are enrolled against the target, calculated by the system.',
  },
  INDICATOR_LINKAGE: {
    label: 'Indicator linkage',
    description: 'Share of activities linked to at least one indicator, calculated by the system.',
  },
  ASSESSMENT_GAIN: {
    label: 'Assessment gain',
    description:
      'Share of paired before and after assessments that improved, calculated by the system.',
  },
  OTHER: {
    label: 'Other',
    description:
      'A criterion the project data cannot compute, so the officer scores it and says why.',
  },
}

/** Human label for a criterion code or type; falls back to the stored value. */
export const criterionLabel = (code: string) => criterionTerms[code]?.label ?? code

/** Plain-language hint for a criterion code or type, or null when there is nothing to add. */
export const criterionHint = (code: string) => criterionTerms[code]?.description ?? null
