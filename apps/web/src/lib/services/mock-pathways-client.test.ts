import { describe, expect, it } from 'vitest'

import { MockPathwaysClient } from './mock-pathways-client'

describe('MockPathwaysClient dashboard data', () => {
  const client = new MockPathwaysClient()

  it('maps supported roles to role-specific dashboard headings', async () => {
    await expect(client.getDashboard('Program Manager')).resolves.toMatchObject({
      heading: 'Program Manager dashboard',
    })

    await expect(client.getDashboard('Project Officer')).resolves.toMatchObject({
      heading: 'Project Officer dashboard',
    })
  })

  it('keeps role dashboard content distinct when role preview changes', async () => {
    const programManager = await client.getDashboard('Program Manager')
    const projectManager = await client.getDashboard('Project Manager')

    expect(programManager.metrics.map((metric) => metric.label)).not.toEqual(
      projectManager.metrics.map((metric) => metric.label),
    )
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
})
