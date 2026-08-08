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

    await expect(client.getDashboard('Project Officer')).resolves.toMatchObject({
      heading: 'Project Officer dashboard',
    })
  })

  it('keeps role dashboard content distinct when role preview changes', async () => {
    const programManager = await client.getDashboard('Program Manager')
    const projectManager = await client.getDashboard('Project Manager')

    expect(programManager.executive).toBeDefined()
    expect(projectManager.executive).toBeUndefined()
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
    const programProjects = await client.getProjectsForRole('Program Manager')
    const projectOfficerProjects = await client.getProjectsForRole('Project Officer')

    expect(programProjects.length).toBeGreaterThanOrEqual(projectOfficerProjects.length)
    expect(projectOfficerProjects.map((project) => project.id)).toContain('futuremakers-ncr')
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

  it('serves private mock photo and video proof for a Beneficiary record', async () => {
    const media = await client.getBeneficiaryMediaProof('ben-001')

    expect(media).toHaveLength(3)
    expect(media.map((item) => item.mediaType)).toEqual(expect.arrayContaining(['Photo', 'Video']))
    expect(media.every((item) => item.beneficiaryId === 'ben-001')).toBe(true)
    expect(media.every((item) => item.source === 'Mock media')).toBe(true)
    await expect(client.getBeneficiaryMediaProof('unknown-beneficiary')).resolves.toEqual([])
  })

  it('returns typed prototype users with visible account states', async () => {
    const users = await client.getUsers()

    expect(users).toHaveLength(6)
    expect(users.filter((user) => user.accountStatus === 'Active')).toHaveLength(5)
    expect(users.filter((user) => user.accountStatus === 'Invited')).toHaveLength(1)
    expect(users.every((user) => user.email && user.projectAccess.length > 0)).toBe(true)
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
