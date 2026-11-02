import type { OverdueExplanationCategory } from '@pathways/shared'

export const categoryLabels: Record<OverdueExplanationCategory, string> = {
  WEATHER: 'Weather',
  SECURITY: 'Security',
  FUNDING: 'Funding',
  COMMUNITY: 'Community',
  LOGISTICS: 'Logistics',
  OTHER: 'Other',
}

/** The Project Manager card that lists journey stages with no activity. */
export const stagesWithoutActivity = {
  title: 'Stages without an activity',
  description: 'A survey form needs an activity on its stage.',
  create: 'Create activity',
  createFor: (stage: string) => `Create activity for ${stage}`,
  createAll: 'Create all',
  noDates: "Set the project's dates first.",
  refused: 'The activity could not be created.',
} as const
