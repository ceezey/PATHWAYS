import { describe, expect, it } from 'vitest'

import { defaultDisplayLabels, displayLabelGroups, mergeDisplayLabels } from './display-labels'

describe('display labels', () => {
  it('uses the locked terminology as the default presentation wording', () => {
    expect(defaultDisplayLabels).toMatchObject({
      moduleProjects: 'Project Information Management',
      moduleBeneficiaries: 'Beneficiary Journey Tracking',
      moduleCollection: 'Metadata-Driven Data Integration',
      moduleAnalytics: 'Data Analysis',
      moduleAlerts: 'Rule-Based Alerts',
      moduleAlertsRepository: 'Alerts Repository',
      moduleLabelSettings: 'Edit Labels',
      moduleRecommendations: 'Human-reviewed recommendation',
      moduleUserManagement: 'User Management',
      projectMonitorEvaluate: 'Monitoring & Evaluation',
      projectPublicDashboard: 'Public Project Dashboard',
      projectWorkspace: 'Project Workspace',
    })
  })

  it('merges safe stored values while retaining defaults for missing or blank labels', () => {
    expect(
      mergeDisplayLabels({
        sidebarBeneficiaries: 'Community journeys',
        moduleBeneficiaries: 'Beneficiary progress review',
        moduleCollection: 'Field data collection',
        moduleAnalytics: 'Program analysis review',
        moduleProjects: 'Custom project heading',
        projectWorkspace: 'Configurable project workspace',
        unknownLabel: 'Ignored',
      }),
    ).toMatchObject({
      moduleBeneficiaries: 'Beneficiary progress review',
      moduleCollection: 'Field data collection',
      moduleProjects: 'Custom project heading',
      moduleAnalytics: 'Program analysis review',
      projectWorkspace: defaultDisplayLabels.projectWorkspace,
    })
    expect(mergeDisplayLabels({ sidebarBeneficiaries: 'Community journeys' })).not.toHaveProperty(
      'sidebarBeneficiaries',
    )
  })

  it('falls back safely when stored label data is malformed', () => {
    expect(mergeDisplayLabels(['not', 'a', 'label', 'record'])).toEqual(defaultDisplayLabels)
  })

  it('limits the editor to the ten approved System Administrator page headings', () => {
    const editableKeys = displayLabelGroups.flatMap((group) =>
      group.labels.map((definition) => definition.key),
    )

    expect(editableKeys).toEqual([
      'moduleProjects',
      'moduleBeneficiaries',
      'moduleCollection',
      'moduleAnalytics',
      'moduleAlerts',
      'moduleRecommendations',
      'moduleReports',
      'moduleAlertsRepository',
      'moduleUserManagement',
      'moduleLabelSettings',
    ])
  })
})
