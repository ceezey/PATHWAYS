// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { authorizeDemoAccount, saveDemoAccount } from './accounts'
import {
  approvePublication,
  createBackup,
  publishPublication,
  restoreBackup,
  unpublishPublication,
  updatePublication,
} from './administration'
import {
  addBeneficiaryNote,
  recordBeneficiaryParticipation,
  saveBeneficiary,
  setBeneficiaryStatus,
} from './beneficiaries'
import { importEntries, saveEntry, saveForm } from './collection'
import { artifactBytes } from './exports'
import { decideRecommendation, reviewAlert, reviewRecommendation, saveRule } from './monitoring'
import {
  approveProgress,
  reassignProjectTeam,
  reviewExpense,
  saveExpense,
  saveIndicator,
  saveProject,
} from './projects'
import { saveGeneratedReport } from './reports'
import {
  DEMO_KEY,
  currentAccount,
  getDemoState,
  resetDemo,
  setDemoScenario,
  switchDemoAccount,
} from './store'

beforeEach(() => {
  localStorage.clear()
  resetDemo()
})

describe('I03 linked delivery workflow', () => {
  it('restricts modular project-team reassignment and propagates selected member scope', () => {
    const assignment = {
      programManager: 'Program Manager Demo',
      projectManager: 'Project Manager Demo',
      monitoringOfficer: 'Monitoring Officer Demo',
      projectOfficers: ['Project Officer Demo'],
    }

    for (const accountId of [
      'project-manager',
      'program-manager',
      'grant-manager',
      'system-administrator',
    ]) {
      resetDemo()
      switchDemoAccount(accountId)
      expect(() => reassignProjectTeam('futuremakers-ncr', assignment)).not.toThrow()
    }

    const state = getDemoState()
    expect(state.projects.find((project) => project.id === 'futuremakers-ncr')).toMatchObject({
      ...assignment,
    })
    expect(
      state.accounts.find((account) => account.id === 'project-officer')?.projectIds,
    ).toContain('futuremakers-ncr')

    resetDemo()
    switchDemoAccount('project-manager')
    reassignProjectTeam('futuremakers-ncr', {
      ...assignment,
      programManager: 'Program Manager A',
      projectManager: 'Project Manager A',
    })
    expect(
      getDemoState().accounts.find((account) => account.id === 'program-manager')?.projectIds,
    ).toContain('futuremakers-ncr')
    expect(currentAccount()?.projectIds).toContain('futuremakers-ncr')
    expect(getDemoState().projects.some((project) => project.id === 'futuremakers-ncr')).toBe(true)

    resetDemo()
    switchDemoAccount('monitoring-evaluation-officer')
    expect(() => reassignProjectTeam('futuremakers-ncr', assignment)).toThrow('permission')

    resetDemo()
    switchDemoAccount('project-manager')
    expect(() => reassignProjectTeam('youth-rise-western-samar', assignment)).toThrow(
      'outside your authorized scope',
    )
  })

  it('assigns a new project only to the named team and the creating manager', () => {
    switchDemoAccount('system-administrator')
    const unselectedOfficerId = saveDemoAccount({
      name: 'Unselected Fictional Officer',
      email: 'unselected@demo.pathways.local',
      role: 'Project Officer',
      projectIds: ['futuremakers-ncr'],
    })
    authorizeDemoAccount(unselectedOfficerId)
    switchDemoAccount('project-manager')
    const project = saveProject({
      title: 'Fictional scoped project',
      objectives: 'Verify exact team assignment behavior.',
      area: 'Metro Manila',
      partners: 'Demo partner',
      projectBudget: 100000,
      sector: 'Education',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      status: 'Planned',
      budgetCode: 'DEMO-SCOPE-01',
      description: 'A fictional project used to verify selected team assignments.',
      programManager: 'Program Manager Demo',
      projectManager: 'Project Manager Demo',
      monitoringOfficer: 'Monitoring Officer Demo',
      projectOfficers: ['Project Officer Demo'],
    })
    const state = getDemoState()
    expect(
      state.accounts.find((account) => account.id === 'project-officer')?.projectIds,
    ).toContain(project.id)
    expect(
      state.accounts.find((account) => account.id === unselectedOfficerId)?.projectIds,
    ).not.toContain(project.id)
  })
  it('verifies expenses once, updates utilization, and supports correction', () => {
    switchDemoAccount('project-officer')
    const expense = saveExpense({
      projectId: 'futuremakers-ncr',
      activityId: 'act-fm-01',
      amount: 1000,
      category: 'Materials',
      date: '2026-09-09',
      description: 'Fictional workshop supplies',
    })
    expect(expense.status).toBe('For Verification')
    switchDemoAccount('monitoring-evaluation-officer')
    const before = getDemoState().budgets.find(
      (row) => row.projectId === expense.projectId,
    )?.actualSpending
    expect(before).toBeDefined()
    if (before === undefined) throw new Error('Budget fixture is unavailable.')
    reviewExpense(expense.id, true)
    expect(
      getDemoState().budgets.find((row) => row.projectId === expense.projectId)?.actualSpending,
    ).toBe(before + 1000)
    expect(() => reviewExpense(expense.id, true)).toThrow('awaiting')
  })
  it('enforces correction reasons, PM progress approval, and indicator uniqueness', () => {
    switchDemoAccount('project-officer')
    const expense = saveExpense({
      projectId: 'futuremakers-ncr',
      activityId: 'act-fm-01',
      amount: 900,
      category: 'Travel',
      date: '2026-09-09',
      description: 'Fictional local travel',
    })
    switchDemoAccount('monitoring-evaluation-officer')
    expect(() => reviewExpense(expense.id, false)).toThrow('reason')
    reviewExpense(expense.id, false, 'Attach the fictional receipt reference.')
    expect(getDemoState().expenses[0].status).toBe('For Correction')
    saveIndicator({
      projectId: 'futuremakers-ncr',
      code: 'IND-TEST',
      label: 'Fictional completions',
      description: 'Count of fictional completions',
      unit: 'people',
      disaggregation: 'sex, age, disability',
      dataSource: 'demo entries',
      target: 12,
      actual: 0,
    })
    expect(() =>
      saveIndicator({
        projectId: 'futuremakers-ncr',
        code: 'IND-X',
        label: 'Fictional completions',
        description: 'Duplicate',
        unit: 'people',
        disaggregation: 'sex',
        dataSource: 'demo',
        target: 1,
        actual: 0,
      }),
    ).toThrow('Duplicate')
    switchDemoAccount('project-manager')
    approveProgress('act-fm-01', false, 'Clarify the completion basis.')
    expect(getDemoState().activities.find((row) => row.id === 'act-fm-01')?.progressApproval).toBe(
      'For Correction',
    )
  })
})

describe('I04 collection and import', () => {
  it('publishes a form, keeps unvalidated drafts, and propagates a valid entry', () => {
    switchDemoAccount('project-officer')
    const form = saveForm({
      projectId: 'futuremakers-ncr',
      title: 'Fictional attendance',
      description: 'Attendance',
      status: 'Published',
      indicatorIds: [],
      fields: [
        {
          id: 'attendance_status',
          code: 'attendance_status',
          label: 'Attendance',
          type: 'single_select',
          required: true,
          options: ['Present', 'Absent'],
        },
      ],
    })
    const draft = saveEntry({
      projectId: '',
      formId: '',
      beneficiaryId: '',
      activityId: '',
      date: '',
      values: {},
      status: 'Draft',
      source: 'Manual',
      dataType: 'activity',
    })
    expect(draft.status).toBe('Draft')
    saveEntry({
      projectId: 'futuremakers-ncr',
      formId: form.id,
      beneficiaryId: 'ben-001',
      activityId: 'act-fm-01',
      date: '2026-09-09',
      values: { attendance_status: 'Present' },
      status: 'Submitted',
      source: 'Manual',
      dataType: 'participant',
    })
    expect(getDemoState().forms.find((row) => row.id === form.id)?.responseCount).toBe(1)
    expect(
      getDemoState()
        .beneficiaries.find((row) => row.id === 'ben-001')
        ?.participation.at(-1)?.participatedAt,
    ).toBe('2026-09-09')
    expect(() => saveForm({ ...form, title: 'Changed' }, form.id)).toThrow('collected data')
  })
  it('isolates invalid imports and requires a duplicate decision', () => {
    switchDemoAccount('project-officer')
    const good = {
      projectId: 'futuremakers-ncr',
      formId: '',
      beneficiaryId: 'ben-001',
      activityId: 'act-fm-01',
      date: '2026-09-08',
      values: { attendance_status: 'Present' },
      status: 'Submitted' as const,
      source: 'Import' as const,
      dataType: 'participant' as const,
    }
    const bad = { ...good, beneficiaryId: 'missing' }
    const summary = importEntries('futuremakers-ncr', 'fictional.csv', [good, bad], 'skip')
    expect(summary).toMatchObject({ accepted: 1, rejected: 1 })
    expect(() => importEntries('futuremakers-ncr', 'duplicate.csv', [good], 'pending')).toThrow(
      'Duplicate',
    )
  })
})

describe('I05 beneficiary journeys', () => {
  it('creates a scoped profile and retains notes, status, and participation', () => {
    switchDemoAccount('project-officer')
    const record = saveBeneficiary({
      code: 'BEN-DEMO-900',
      firstName: 'Fictional',
      lastName: 'Learner',
      sex: 'Female',
      age: 20,
      disabilityStatus: 'Without disability',
      province: 'Metro Manila',
      city: 'Quezon City',
      barangay: 'Demo Barangay',
      consentToParticipate: true,
      consentToStoreData: true,
      isMinor: false,
      guardianConsent: false,
      projectId: 'futuremakers-ncr',
    })
    addBeneficiaryNote(record.id, 'stage-vocational', 'Project team', 'Fictional follow-up note.')
    recordBeneficiaryParticipation(record.id, {
      activityId: 'act-fm-01',
      participatedAt: '2026-09-09',
      attendanceStatus: 'Present',
      note: 'Fictional attendance.',
    })
    setBeneficiaryStatus(record.id, 'Completed')
    const saved = getDemoState().beneficiaries.find((row) => row.id === record.id)
    expect(saved).toBeDefined()
    if (!saved) throw new Error('Saved beneficiary fixture is unavailable.')
    expect(saved).toMatchObject({ enrollmentStatus: 'Completed' })
    expect(saved.notes).toHaveLength(1)
    expect(saved.participation).toHaveLength(1)

    const updated = saveBeneficiary(
      {
        code: saved.code,
        firstName: saved.firstName,
        middleName: 'Updated',
        lastName: saved.lastName,
        sex: saved.sex,
        age: saved.age,
        birthDate: saved.birthDate,
        disabilityStatus: saved.disabilityStatus,
        province: saved.province,
        city: saved.city,
        barangay: 'Updated Demo Barangay',
        consentToParticipate: saved.consentToParticipate,
        consentToStoreData: saved.consentToStoreData,
        isMinor: saved.isMinor,
        guardianConsent: saved.guardianConsent,
        projectId: 'futuremakers-ncr',
      },
      false,
      saved.id,
    )
    expect(updated).toMatchObject({
      id: saved.id,
      middleName: 'Updated',
      barangay: 'Updated Demo Barangay',
      enrollmentStatus: 'Completed',
    })
    expect(updated.notes).toHaveLength(1)
    expect(updated.participation).toHaveLength(1)
  })
})

describe('I06-I08 monitoring decisions, reports, and genuine files', () => {
  it('applies a system-wide rule and preserves review/outcome restrictions', () => {
    switchDemoAccount('system-administrator')
    const rule = saveRule({
      name: 'Fictional budget check',
      category: 'Budget',
      parameter: 'fictional test utilization',
      operator: 'above',
      threshold: 1,
      severity: 'High',
      status: 'Active',
      suggestedAction: 'Review spending.',
      description: 'Flag utilization above one percent.',
    })
    expect(getDemoState().alerts.some((row) => row.ruleId === rule.id)).toBe(true)
    switchDemoAccount('monitoring-evaluation-officer')
    const alert = getDemoState().alerts.find((row) => row.ruleId === rule.id)
    expect(alert).toBeDefined()
    if (!alert) throw new Error('Generated alert fixture is unavailable.')
    reviewAlert(alert.id)
    const recommendation = getDemoState().recommendations.find((row) => row.alertId === alert.id)
    expect(recommendation).toBeDefined()
    if (!recommendation) throw new Error('Generated recommendation fixture is unavailable.')
    reviewRecommendation(recommendation.id)
    expect(() => decideRecommendation(recommendation.id, 'Accept', 'Fictional decision.')).toThrow(
      'permission',
    )
    switchDemoAccount('project-manager')
    decideRecommendation(recommendation.id, 'Accept', 'Proceed with the fictional mitigation.')
    expect(getDemoState().alerts.find((row) => row.id === alert.id)?.lifecycleStatus).toBe(
      'Resolved',
    )
    expect(getDemoState().notifications.length).toBeGreaterThan(0)
  })
  it('generates report history and writes distinct CSV/XLSX/XLS/PDF payloads', () => {
    switchDemoAccount('project-manager')
    saveGeneratedReport(
      'project-summary',
      ['futuremakers-ncr'],
      ['Project', 'Status'],
      [['FutureMakers NCR', 'Active']],
      { project: 'futuremakers-ncr' },
    )
    expect(getDemoState().reports).toHaveLength(1)
    expect(new TextDecoder().decode(artifactBytes('Demo', [['a']], 'csv'))).toContain('"a"')
    expect(Array.from(artifactBytes('Demo', [['a']], 'xlsx').slice(0, 2))).toEqual([80, 75])
    expect(Array.from(artifactBytes('Demo', [['a']], 'xls').slice(0, 4))).toEqual([
      208, 207, 17, 224,
    ])
    expect(new TextDecoder().decode(artifactBytes('Demo', [['a']], 'pdf').slice(0, 8))).toContain(
      '%PDF-1.4',
    )
  })
})

describe('I09 backup and publication', () => {
  it('restores atomically and preserves current state on simulated restore failure', () => {
    switchDemoAccount('system-administrator')
    const backup = createBackup()
    const baselineTitle = getDemoState().projects[0].title
    const changed = structuredClone(getDemoState())
    changed.projects[0].title = 'Changed after backup'
    localStorage.setItem(DEMO_KEY, JSON.stringify(changed))
    restoreBackup(backup.id)
    expect(getDemoState().projects[0].title).toBe(baselineTitle)
    setDemoScenario('restore-failure')
    const prior = JSON.stringify(getDemoState().projects)
    expect(() => restoreBackup(backup.id)).toThrow('retained')
    expect(JSON.stringify(getDemoState().projects)).toBe(prior)
  })
  it('requires complete approved revision and projects publish/unpublish locally', () => {
    switchDemoAccount('system-administrator')
    updatePublication('futuremakers-ncr', { tagline: 'A revised fictional public story' })
    expect(() => publishPublication('futuremakers-ncr')).toThrow('approved')
    approvePublication('futuremakers-ncr')
    publishPublication('futuremakers-ncr')
    expect(
      getDemoState().publications.find((row) => row.projectId === 'futuremakers-ncr')?.published
        ?.tagline,
    ).toBe('A revised fictional public story')
    unpublishPublication('futuremakers-ncr')
    expect(
      getDemoState().publications.find((row) => row.projectId === 'futuremakers-ncr')?.published,
    ).toBeNull()
  })
})
