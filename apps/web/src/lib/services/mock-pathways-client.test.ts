import { describe, expect, it } from 'vitest'

import { MockPathwaysClient } from './mock-pathways-client'

describe('MockPathwaysClient dashboard data', () => {
  const client = new MockPathwaysClient()

  it('maps supported roles to role-specific dashboard headings', async () => {
    await expect(client.getDashboard('Program Manager')).resolves.toMatchObject({
      heading: 'Program Manager dashboard',
      primaryAction: {
        href: '/projects',
        label: 'Review Project Portfolio',
      },
    })

    await expect(client.getDashboard('Grant Manager')).resolves.toMatchObject({
      heading: 'Grant Manager dashboard',
      primaryAction: {
        href: '/reports',
        label: 'Review Aggregate Reports',
      },
    })

    await expect(client.getDashboard('Project Officer')).resolves.toMatchObject({
      heading: 'Project Officer dashboard',
    })
  })

  it('keeps role dashboard content distinct when role preview changes', async () => {
    const programManager = await client.getDashboard('Program Manager')
    const grantManager = await client.getDashboard('Grant Manager')
    const projectManager = await client.getDashboard('Project Manager')

    expect(programManager.executive).toBeDefined()
    expect(grantManager.executive).toBeUndefined()
    expect(projectManager.executive).toBeUndefined()
    expect(grantManager.summary).toContain('aggregate information only')
    expect(JSON.stringify(grantManager)).not.toMatch(/\/beneficiaries|\/settings\/users/i)
    expect(grantManager.metrics.map((metric) => metric.label)).not.toEqual(
      programManager.metrics.map((metric) => metric.label),
    )
    expect(programManager.metrics.map((metric) => metric.label)).not.toEqual(
      projectManager.metrics.map((metric) => metric.label),
    )
  })

  it('describes Edit Labels as page-heading configuration for System Administrator', async () => {
    const dashboard = await client.getDashboard('System Administrator')
    const labelSettings = dashboard.sections
      .flatMap((section) => section.items)
      .find((item) => item.href === '/settings/labels')

    expect(dashboard.summary).toContain('approved page headings')
    expect(labelSettings?.description).toContain('approved page headings')
    expect(JSON.stringify(dashboard)).not.toContain('sidebar item labels')
  })

  it('provides portfolio and project contexts for executive review', async () => {
    const dashboard = await client.getDashboard('Program Manager')

    expect(dashboard.executive?.defaultContextId).toBe('portfolio')
    expect(dashboard.executive?.contexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'portfolio', deliveryStatus: 'At Risk' }),
        expect.objectContaining({ id: 'futuremakers-ncr', deliveryStatus: 'On Track' }),
        expect.objectContaining({
          id: 'safe-spaces-northern-samar',
          deliveryStatus: 'Behind Schedule',
        }),
      ]),
    )
    expect(JSON.stringify(dashboard)).not.toContain('Portfolio impact')
  })

  it('returns a safe fallback for an unknown role', async () => {
    const dashboard = await client.getDashboard('Unknown Role')

    expect(dashboard.heading).toBe('Dashboard unavailable for selected role')
    expect(dashboard.sections[0]?.items).toEqual([])
  })

  it('filters project directory records by prototype role', async () => {
    const allProjectIds = (await client.getProjects()).map((project) => project.id)

    await expect(
      client
        .getProjectsForRole('Project Manager')
        .then((projects) => projects.map((project) => project.id)),
    ).resolves.toEqual(['futuremakers-ncr'])
    await expect(
      client
        .getProjectsForRole('Project Officer')
        .then((projects) => projects.map((project) => project.id)),
    ).resolves.toEqual(['futuremakers-ncr'])
    await expect(
      client
        .getProjectsForRole('Monitoring and Evaluation Officer')
        .then((projects) => projects.map((project) => project.id)),
    ).resolves.toEqual(['futuremakers-ncr', 'grassroots-centers-navotas'])

    for (const role of ['Program Manager', 'Grant Manager', 'System Administrator'] as const) {
      await expect(
        client.getProjectsForRole(role).then((projects) => projects.map((project) => project.id)),
      ).resolves.toEqual(allProjectIds)
    }
  })

  it('fails closed when project scope is requested for an unsupported role', async () => {
    await expect(client.getProjectsForRole('Unknown Role')).resolves.toEqual([])
  })

  it('scopes alerts and recommendations to role project access and module authority', async () => {
    const allRecommendationCount = (await client.getRecommendations()).length

    await expect(
      client
        .getAlertsForRole('Project Manager')
        .then((alerts) => [...new Set(alerts.map((alert) => alert.projectId))]),
    ).resolves.toEqual(['futuremakers-ncr'])
    await expect(
      client
        .getRecommendationsForRole('Project Manager')
        .then((recommendations) => recommendations.map((recommendation) => recommendation.id)),
    ).resolves.toEqual(['rec-fm-low-kpi', 'rec-fm-bootcamp'])

    for (const role of ['Program Manager', 'System Administrator'] as const) {
      await expect(client.getAlertsForRole(role)).resolves.toHaveLength(6)
      await expect(client.getRecommendationsForRole(role)).resolves.toHaveLength(
        allRecommendationCount,
      )
    }

    for (const role of [
      'Project Officer',
      'Monitoring and Evaluation Officer',
      'Grant Manager',
    ] as const) {
      await expect(client.getAlertsForRole(role)).resolves.toEqual([])
      await expect(client.getRecommendationsForRole(role)).resolves.toEqual([])
    }
  })

  it('creates and reads a temporary prototype project', async () => {
    const project = await client.createProject({
      title: 'Prototype Community Project',
      sector: 'Community Resilience',
      area: 'Quezon City',
      startDate: '2026-08-01',
      endDate: '2026-12-31',
      status: 'Planned',
      budgetCode: 'PCP-2026',
      description: 'Temporary prototype project for the Phase 3 setup flow.',
      programManager: 'Program Manager A',
      projectManager: 'Project Manager A',
      monitoringOfficer: 'Monitoring and Evaluation Officer A',
      projectOfficers: ['Project Officer A'],
    })

    await expect(client.getProject(project.id)).resolves.toMatchObject({
      title: 'Prototype Community Project',
      createdInPrototype: true,
    })
    await expect(
      client
        .getProjectsForRole('Project Manager')
        .then((projects) => projects.map((record) => record.id)),
    ).resolves.toContain(project.id)
    await expect(
      client
        .getProjectsForRole('Monitoring and Evaluation Officer')
        .then((projects) => projects.map((record) => record.id)),
    ).resolves.toContain(project.id)
    await expect(
      client
        .getProjectsForRole('Project Officer')
        .then((projects) => projects.map((record) => record.id)),
    ).resolves.toContain(project.id)
  })

  it('creates, edits, and reads a temporary prototype activity', async () => {
    const activity = await client.createActivity({
      projectId: 'futuremakers-ncr',
      title: 'Prototype activity test',
      description: 'Temporary activity created for Phase 4 test coverage.',
      startDate: '2026-08-01',
      dueDate: '2026-08-30',
      targetBeneficiaries: 40,
      budgetAllocation: 25000,
      assignedTo: ['Project Officer A'],
      indicatorIds: ['ind-fm-01'],
      journeyStageId: 'stage-entry',
    })

    const updatedActivity = await client.updateActivity({
      ...activity,
      title: 'Prototype activity test updated',
      status: 'In Progress',
      progress: 35,
      beneficiariesReached: 12,
      budgetLogged: 5000,
    })

    expect(updatedActivity).toMatchObject({
      title: 'Prototype activity test updated',
      progress: 35,
      budgetLogged: 5000,
    })
    await expect(client.getActivity('futuremakers-ncr', activity.id)).resolves.toMatchObject({
      title: 'Prototype activity test updated',
    })
  })

  it('submits a local prototype activity proof record without uploading files', async () => {
    const activity = await client.createActivity({
      projectId: 'futuremakers-ncr',
      title: 'Prototype proof activity',
      description: 'Temporary activity used to verify proof submission state.',
      startDate: '2026-08-01',
      dueDate: '2026-08-30',
      targetBeneficiaries: 20,
      budgetAllocation: 15000,
      assignedTo: ['Project Officer A'],
      indicatorIds: ['ind-fm-01'],
      journeyStageId: 'stage-entry',
    })

    const submittedActivity = await client.submitActivityProof({
      activityId: activity.id,
      progress: 100,
      note: 'Prototype proof submitted.',
      fileNames: ['attendance.pdf'],
    })

    expect(submittedActivity.status).toBe('For Review')
    expect(submittedActivity.submittedProof).toHaveLength(1)
    expect(submittedActivity.submittedProof[0]?.fileName).toBe('attendance.pdf')
    expect(submittedActivity.updateNotes[0]?.note).toBe('Prototype proof submitted.')
  })

  it('provides phase five workspace records for project tabs', async () => {
    await expect(client.getEvidence('futuremakers-ncr')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'orientation-attendance-summary.pdf',
        }),
      ]),
    )
    await expect(client.getProjectIndicators('futuremakers-ncr')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseline: 0,
          code: 'FM-ORIENTED',
        }),
      ]),
    )
    await expect(client.getEvaluation('futuremakers-ncr')).resolves.toMatchObject({
      currentScore: 82,
    })
  })

  it('falls back to safe transparency sections for projects without custom configuration', async () => {
    const sections = await client.getTransparencySections('prototype-project')

    expect(sections.length).toBeGreaterThan(0)
    expect(sections.every((section) => section.projectId === 'prototype-project')).toBe(true)
  })

  it('serves aggregate analytics locations without precise Beneficiary location fields', async () => {
    const locations = await client.getAnalyticsLocations()

    expect(locations).toHaveLength(9)
    expect(locations[0]).toMatchObject({
      coordinatePrecision: 'Approximate city centroid',
      projectSummaries: expect.arrayContaining([
        expect.objectContaining({ beneficiariesReached: expect.any(Number) }),
      ]),
    })
    expect(JSON.stringify(locations)).not.toMatch(
      /beneficiaryId|firstName|lastName|barangay|street|address|contact/i,
    )
  })

  it('serves metadata-linked aggregate survey results without Beneficiary identities', async () => {
    const forms = await client.getSurveyForms('futuremakers-ncr')
    const results = await client.getSurveyAggregateResults({
      formId: 'form-life-skills-training',
      location: 'Navotas',
      responseDate: '2026-07-15',
    })

    expect(forms[0]).toMatchObject({
      title: 'Life Skills Training Survey',
      programName: 'FutureMakers',
      journeyStageId: 'stage-vocational',
      activityId: 'act-fm-02',
    })
    expect(results).toEqual([
      expect.objectContaining({
        projectId: 'futuremakers-ncr',
        reportingPeriod: '2026 Q3',
        responseCount: 40,
        source: 'Synthetic aggregate mock',
      }),
    ])
    expect(JSON.stringify(results)).not.toMatch(
      /beneficiaryId|beneficiaryCode|firstName|lastName|birthDate|barangay/i,
    )
  })

  it('serves private mock photo and video proof for a Beneficiary record', async () => {
    const media = await client.getBeneficiaryMediaProofForRole('System Administrator', 'ben-001')

    expect(media).toHaveLength(3)
    expect(media.map((item) => item.mediaType)).toEqual(expect.arrayContaining(['Photo', 'Video']))
    expect(media.every((item) => item.beneficiaryId === 'ben-001')).toBe(true)
    expect(media.every((item) => item.source === 'Mock media')).toBe(true)
    await expect(
      client.getBeneficiaryMediaProofForRole('System Administrator', 'unknown-beneficiary'),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('enforces the role matrix in typed Beneficiary record services', async () => {
    await expect(client.getBeneficiaryRecordsForRole('Program Manager')).resolves.toEqual([])
    await expect(client.getBeneficiaryRecordsForRole('Grant Manager')).resolves.toEqual([])
    await expect(
      client
        .getBeneficiaryRecordsForRole('Project Manager')
        .then((records) => records.map((record) => record.id)),
    ).resolves.toEqual(expect.arrayContaining(['ben-001', 'ben-004']))
    await expect(
      client
        .getBeneficiaryRecordsForRole('Project Manager')
        .then((records) => records.map((record) => record.id)),
    ).resolves.not.toContain('ben-002')
    await expect(
      client
        .getBeneficiaryRecordsForRole('Monitoring and Evaluation Officer')
        .then((records) => records.map((record) => record.id)),
    ).resolves.toEqual(expect.arrayContaining(['ben-001', 'ben-003']))
    await expect(
      client
        .getBeneficiaryRecordsForRole('System Administrator')
        .then((records) => records.map((record) => record.id)),
    ).resolves.toEqual(expect.arrayContaining(['ben-001', 'ben-002', 'ben-003']))
  })

  it('applies filters after Beneficiary authorization scope', async () => {
    await expect(
      client.getBeneficiaryRecordsForRole('Project Manager', {
        projectId: 'youth-rise-western-samar',
      }),
    ).resolves.toEqual([])
    await expect(
      client.getBeneficiaryRecordsForRole('Monitoring and Evaluation Officer', {
        projectId: 'grassroots-centers-navotas',
      }),
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ben-003' })]))
  })

  it('rejects unassigned direct records and media with a typed restricted result', async () => {
    await expect(
      client.getBeneficiaryRecordForRole('Project Manager', 'ben-001'),
    ).resolves.toMatchObject({ id: 'ben-001', projectIds: ['futuremakers-ncr'] })
    await expect(
      client.getBeneficiaryRecordForRole('Project Manager', 'ben-002'),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      client.getBeneficiaryRecordForRole('Program Manager', 'ben-001'),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      client.getBeneficiaryMediaProofForRole('Project Manager', 'ben-001'),
    ).resolves.toHaveLength(3)
    await expect(
      client.getBeneficiaryMediaProofForRole('Project Manager', 'ben-002'),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('returns role-scoped aggregate SADDD data without identity fields', async () => {
    const aggregates = await client.getBeneficiarySadddAggregatesForRole('Grant Manager')

    expect(aggregates.length).toBeGreaterThan(0)
    expect(JSON.stringify(aggregates)).not.toMatch(
      /beneficiaryId|beneficiaryCode|displayName|firstName|lastName|birthDate|barangay|notes|assessments|media/i,
    )
    await expect(
      client
        .getBeneficiarySadddAggregatesForRole('Project Manager')
        .then((items) => [...new Set(items.map((item) => item.projectId))]),
    ).resolves.toEqual(['futuremakers-ncr'])
  })

  it('returns typed prototype users with visible account states', async () => {
    const users = await client.getUsers()

    expect(users).toHaveLength(7)
    expect(users.filter((user) => user.accountStatus === 'Active')).toHaveLength(6)
    expect(users.filter((user) => user.accountStatus === 'Invited')).toHaveLength(1)
    expect(users.every((user) => user.email && user.projectAccess.length > 0)).toBe(true)
    expect(users).toContainEqual(
      expect.objectContaining({
        id: 'user-grant-manager-a',
        role: 'Grant Manager',
        projectAccess: ['Organization grant portfolio'],
      }),
    )
  })

  it('serves approved public project records without beneficiary-level fields', async () => {
    const publicProjects = await client.getPublicProjects()

    expect(publicProjects.length).toBeGreaterThan(0)
    expect(publicProjects[0]).toMatchObject({
      publicationState: 'Approved for public preview',
      publicPresentation: {
        sectionOrder: expect.arrayContaining(['overview', 'media', 'progress']),
        layoutPreset: 'story-led',
      },
      approvedMedia: [
        expect.objectContaining({
          approvalState: 'Approved for public presentation',
          source: 'Synthetic mock media',
        }),
      ],
    })
    expect(JSON.stringify(publicProjects)).not.toMatch(/firstName|lastName|contact|phone/i)
    expect(JSON.stringify(publicProjects)).not.toMatch(
      /beneficiaryId|skills-session-wide-shot|site-walkthrough/i,
    )
  })

  it('returns a single public project detail record by id', async () => {
    await expect(client.getPublicProject('futuremakers-ncr')).resolves.toMatchObject({
      title: 'FutureMakers NCR',
      projectAreas: expect.arrayContaining(['Quezon City']),
    })
  })
})
