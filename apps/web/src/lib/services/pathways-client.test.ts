import { describe, expect, it } from 'vitest'

import { PathwaysClientError, pathwaysClient } from './pathways-client'

describe('PATHWAYS frontend data boundary', () => {
  it('does not fabricate collection records while domain endpoints are unavailable', async () => {
    const collections = await Promise.all([
      pathwaysClient.getProjects(),
      pathwaysClient.getProjectsForRole('Program Manager'),
      pathwaysClient.getActivities('project-id'),
      pathwaysClient.getEvidence('project-id'),
      pathwaysClient.getProjectIndicators('project-id'),
      pathwaysClient.getExpenses('project-id'),
      pathwaysClient.getRecommendationOutcomes('project-id'),
      pathwaysClient.getTransparencySections('project-id'),
      pathwaysClient.getBeneficiaryRecordsForRole('Program Manager'),
      pathwaysClient.getBeneficiaryMediaProofForRole('Program Manager', 'beneficiary-id'),
      pathwaysClient.getBeneficiarySadddAggregatesForRole('Program Manager'),
      pathwaysClient.getJourneyStages('project-id'),
      pathwaysClient.getIndicators(),
      pathwaysClient.getBudgets(),
      pathwaysClient.getAlerts(),
      pathwaysClient.getRecommendations(),
      pathwaysClient.getRules(),
      pathwaysClient.getReports(),
      pathwaysClient.getSurveyForms(),
      pathwaysClient.getSurveyAggregateResults(),
      pathwaysClient.getAnalyticsLocations(),
      pathwaysClient.getPublicProjects(),
      pathwaysClient.getUsers(),
    ])

    expect(collections.every((records) => records.length === 0)).toBe(true)
  })

  it('reports record reads as explicitly not configured', async () => {
    await expect(pathwaysClient.getProject('project-id')).rejects.toMatchObject({
      code: 'not_configured',
    })
    await expect(pathwaysClient.getPublicProject('project-id')).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
    await expect(pathwaysClient.getDashboard('Program Manager')).rejects.toMatchObject({
      code: 'not_configured',
    })
  })
})
