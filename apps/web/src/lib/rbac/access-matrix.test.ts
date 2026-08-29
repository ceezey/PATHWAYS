import { describe, expect, it } from 'vitest'

import { pathwaysRoles } from '@/types/pathways-role'
import { roleAccessProfiles } from './access-matrix'
import { can, canConfigureProjectAssignmentsForRole, canCreateOrAuthorizeRole } from './can'
import { getRouteAccess } from './route-access'

const testProjectIds = ['project-alpha', 'project-beta']
const projectManagerAssignments = ['project-alpha']

describe('RBAC matrix', () => {
  it.each([
    ['Project Officer', 'budget.expense.log', true],
    ['Project Officer', 'monitor_evaluate.view', false],
    ['Project Officer', 'reports.view', true],
    ['Project Officer', 'reports.beneficiary_summary.view', true],
    ['Project Officer', 'reports.project_summary.view', false],
    ['Project Officer', 'reports.indicator_summary.view', false],
    ['Monitoring and Evaluation Officer', 'budget.expense.verify', true],
    ['Monitoring and Evaluation Officer', 'alerts.outcome.log', false],
    ['Monitoring and Evaluation Officer', 'settings.users.manage', false],
    ['Project Manager', 'evaluation.approve', true],
    ['Project Manager', 'evaluation.formal.submit', false],
    ['Project Manager', 'settings.users.manage', true],
    ['Program Manager', 'budget.portfolio_view', true],
    ['Program Manager', 'activities.view', true],
    ['Program Manager', 'collection.view', true],
    ['Program Manager', 'transparency.preview', true],
    ['Program Manager', 'transparency.publish', false],
    ['Program Manager', 'settings.users.manage', true],
    ['System Administrator', 'rules.configure', true],
    ['System Administrator', 'collection.view', true],
    ['System Administrator', 'budget.expense.approve', false],
    ['Grant Manager', 'projects.view', true],
    ['Grant Manager', 'budget.portfolio_view', true],
    ['Grant Manager', 'analytics.view', true],
    ['Grant Manager', 'reports.view', true],
    ['Grant Manager', 'reports.project_summary.view', true],
    ['Grant Manager', 'reports.indicator_summary.view', true],
    ['Grant Manager', 'reports.beneficiary_summary.view', false],
    ['Grant Manager', 'activities.view', false],
    ['Grant Manager', 'collection.view', false],
    ['Grant Manager', 'settings.view', false],
    ['Grant Manager', 'settings.users.manage', false],
  ] as const)('%s permission %s is %s', (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected)
  })

  it('encodes the exact project, Beneficiary, and assignment scope for every role', () => {
    expect(roleAccessProfiles['System Administrator']).toMatchObject({
      projectAccess: 'organization',
      beneficiaryDataAccess: 'all-records',
      userAdministration: {
        createAndAuthorizeRoles: pathwaysRoles,
        projectAssignmentRoles: [
          'Project Manager',
          'Project Officer',
          'Monitoring and Evaluation Officer',
        ],
        projectAssignmentScope: 'all-projects',
      },
    })
    expect(roleAccessProfiles['Program Manager']).toMatchObject({
      projectAccess: 'portfolio',
      beneficiaryDataAccess: 'aggregate-only',
      userAdministration: {
        createAndAuthorizeRoles: ['Project Manager', 'Monitoring and Evaluation Officer'],
        projectAssignmentRoles: ['Project Manager', 'Monitoring and Evaluation Officer'],
        projectAssignmentScope: 'portfolio-projects',
      },
    })
    expect(roleAccessProfiles['Project Manager']).toMatchObject({
      projectAccess: 'assigned-projects',
      beneficiaryDataAccess: 'assigned-project-records',
      userAdministration: {
        createAndAuthorizeRoles: ['Project Officer', 'Monitoring and Evaluation Officer'],
        projectAssignmentRoles: ['Project Officer', 'Monitoring and Evaluation Officer'],
        projectAssignmentScope: 'assigned-projects',
      },
    })
    expect(roleAccessProfiles['Project Officer']).toMatchObject({
      projectAccess: 'assigned-projects',
      beneficiaryDataAccess: 'assigned-project-records',
      userAdministration: {
        createAndAuthorizeRoles: [],
        projectAssignmentRoles: [],
        projectAssignmentScope: 'none',
      },
    })
    expect(roleAccessProfiles['Monitoring and Evaluation Officer']).toMatchObject({
      projectAccess: 'assigned-projects',
      beneficiaryDataAccess: 'assigned-project-records',
      userAdministration: {
        createAndAuthorizeRoles: [],
        projectAssignmentRoles: [],
        projectAssignmentScope: 'none',
      },
    })
    expect(roleAccessProfiles['Grant Manager']).toMatchObject({
      role: 'Grant Manager',
      projectAccess: 'portfolio',
      beneficiaryDataAccess: 'aggregate-only',
      userAdministration: {
        createAndAuthorizeRoles: [],
        projectAssignmentRoles: [],
        projectAssignmentScope: 'none',
      },
    })
  })

  it('limits account creation and authorization to the locked hierarchy', () => {
    expect(
      pathwaysRoles.filter((role) => canCreateOrAuthorizeRole('System Administrator', role)),
    ).toEqual(pathwaysRoles)
    expect(
      pathwaysRoles.filter((role) => canCreateOrAuthorizeRole('Program Manager', role)),
    ).toEqual(['Project Manager', 'Monitoring and Evaluation Officer'])
    expect(
      pathwaysRoles.filter((role) => canCreateOrAuthorizeRole('Project Manager', role)),
    ).toEqual(['Monitoring and Evaluation Officer', 'Project Officer'])

    for (const role of [
      'Project Officer',
      'Monitoring and Evaluation Officer',
      'Grant Manager',
    ] as const) {
      expect(pathwaysRoles.some((targetRole) => canCreateOrAuthorizeRole(role, targetRole))).toBe(
        false,
      )
    }
  })

  it('limits project-assignment target roles to the locked hierarchy', () => {
    expect(canConfigureProjectAssignmentsForRole('System Administrator', 'Project Manager')).toBe(
      true,
    )
    expect(canConfigureProjectAssignmentsForRole('System Administrator', 'Project Officer')).toBe(
      true,
    )
    expect(
      canConfigureProjectAssignmentsForRole(
        'System Administrator',
        'Monitoring and Evaluation Officer',
      ),
    ).toBe(true)

    expect(canConfigureProjectAssignmentsForRole('Program Manager', 'Project Manager')).toBe(true)
    expect(
      canConfigureProjectAssignmentsForRole('Program Manager', 'Monitoring and Evaluation Officer'),
    ).toBe(true)
    expect(canConfigureProjectAssignmentsForRole('Program Manager', 'Project Officer')).toBe(false)

    expect(canConfigureProjectAssignmentsForRole('Project Manager', 'Project Officer')).toBe(true)
    expect(
      canConfigureProjectAssignmentsForRole('Project Manager', 'Monitoring and Evaluation Officer'),
    ).toBe(true)
    expect(canConfigureProjectAssignmentsForRole('Project Manager', 'Project Manager')).toBe(false)

    for (const role of [
      'Project Officer',
      'Monitoring and Evaluation Officer',
      'Grant Manager',
    ] as const) {
      expect(canConfigureProjectAssignmentsForRole(role, 'Project Manager')).toBe(false)
      expect(canConfigureProjectAssignmentsForRole(role, 'Project Officer')).toBe(false)
      expect(canConfigureProjectAssignmentsForRole(role, 'Monitoring and Evaluation Officer')).toBe(
        false,
      )
    }
  })

  it('denies direct routes for disallowed modules', () => {
    expect(getRouteAccess('Program Manager', '/projects/project-alpha/activities')).toMatchObject({
      allowed: true,
      moduleName: 'Activities',
    })
    expect(
      getRouteAccess('Project Officer', '/projects/project-alpha/monitor-evaluate'),
    ).toMatchObject({
      allowed: false,
      moduleName: 'Monitor & Evaluate',
    })
    expect(getRouteAccess('Monitoring and Evaluation Officer', '/alerts/repository')).toMatchObject(
      {
        allowed: true,
        moduleName: 'Alerts Repository',
      },
    )
    expect(getRouteAccess('Project Officer', '/alerts/repository')).toMatchObject({
      allowed: false,
      moduleName: 'Alerts Repository',
    })
  })

  it('denies Project Manager direct routes outside the assigned project scope', () => {
    expect(
      getRouteAccess('Project Manager', '/projects/project-alpha', projectManagerAssignments),
    ).toMatchObject({
      allowed: true,
      moduleName: 'Projects',
    })
    expect(
      getRouteAccess('Project Manager', '/projects/project-beta', projectManagerAssignments),
    ).toMatchObject({
      allowed: false,
      moduleName: 'Projects',
    })
    expect(
      getRouteAccess(
        'Project Manager',
        '/projects/project-beta/activities',
        projectManagerAssignments,
      ),
    ).toMatchObject({
      allowed: false,
      moduleName: 'Activities',
    })
  })

  it.each([
    ['Project Manager', 'project-beta'],
    ['Project Officer', 'project-beta'],
    ['Monitoring and Evaluation Officer', 'project-gamma'],
  ] as const)('denies every unassigned project workspace path for %s', (role, projectId) => {
    for (const suffix of [
      '',
      '/activities',
      '/activities/example-activity',
      '/evidence',
      '/indicators',
      '/monitor-evaluate',
      '/budget',
      '/journey-stages',
      '/transparency',
      '/transparency/preview',
    ]) {
      expect(getRouteAccess(role, `/projects/${projectId}${suffix}`).allowed).toBe(false)
    }
  })

  it('allows the System Administrator to open every project summary route', () => {
    for (const projectId of testProjectIds) {
      expect(getRouteAccess('System Administrator', `/projects/${projectId}`)).toMatchObject({
        allowed: true,
        moduleName: 'Projects',
      })
    }
  })

  it('keeps Grant Manager distinct, aggregate-only, and outside operational administration', () => {
    expect(getRouteAccess('Grant Manager', '/projects')).toMatchObject({
      allowed: true,
      moduleName: 'Projects',
    })
    expect(getRouteAccess('Grant Manager', '/analytics')).toMatchObject({
      allowed: true,
      moduleName: 'Analytics',
    })
    expect(getRouteAccess('Grant Manager', '/reports/project-summary')).toMatchObject({
      allowed: true,
      moduleName: 'Project Summary',
    })
    expect(getRouteAccess('Grant Manager', '/reports/indicator-summary')).toMatchObject({
      allowed: true,
      moduleName: 'Indicator Summary',
    })
    expect(getRouteAccess('Grant Manager', '/reports/survey-results')).toMatchObject({
      allowed: true,
      moduleName: 'Survey/Form Results',
    })
    expect(getRouteAccess('Grant Manager', '/reports/preview?kind=project-summary')).toMatchObject({
      allowed: true,
      moduleName: 'Project Summary preview',
    })
    expect(
      getRouteAccess('Grant Manager', '/reports/preview?kind=beneficiary-summary'),
    ).toMatchObject({
      allowed: false,
      moduleName: 'Beneficiary Summary preview',
    })
    expect(getRouteAccess('Grant Manager', '/reports/beneficiary-summary')).toMatchObject({
      allowed: false,
      moduleName: 'Beneficiary Summary',
    })
    expect(getRouteAccess('Grant Manager', '/beneficiaries')).toMatchObject({
      allowed: false,
      moduleName: 'Beneficiaries',
    })
    expect(getRouteAccess('Grant Manager', '/projects/project-alpha/activities')).toMatchObject({
      allowed: false,
      moduleName: 'Activities',
    })
    expect(getRouteAccess('Grant Manager', '/settings/users')).toMatchObject({
      allowed: false,
      moduleName: 'User Management',
    })
    expect(getRouteAccess('Grant Manager', '/alerts')).toMatchObject({
      allowed: false,
      moduleName: 'Alerts',
    })
    expect(getRouteAccess('Grant Manager', '/recommendations')).toMatchObject({
      allowed: false,
      moduleName: 'Recommendations',
    })
  })

  it('keeps Program Manager on aggregate reporting surfaces without Beneficiary routes', () => {
    expect(getRouteAccess('Program Manager', '/beneficiaries')).toMatchObject({
      allowed: false,
      moduleName: 'Beneficiaries',
    })
    expect(getRouteAccess('Program Manager', '/reports/beneficiary-summary')).toMatchObject({
      allowed: false,
      moduleName: 'Beneficiary Summary',
    })
    expect(getRouteAccess('Program Manager', '/reports/survey-results')).toMatchObject({
      allowed: true,
      moduleName: 'Survey/Form Results',
    })
    expect(getRouteAccess('Program Manager', '/analytics')).toMatchObject({
      allowed: true,
      moduleName: 'Analytics',
    })
  })

  it('limits the staff public-dashboard preview to designated internal roles', () => {
    expect(
      getRouteAccess('Program Manager', '/projects/project-alpha/transparency/preview'),
    ).toMatchObject({ allowed: true, moduleName: 'Public dashboard preview' })
    expect(
      getRouteAccess(
        'Project Manager',
        '/projects/project-alpha/transparency/preview',
        projectManagerAssignments,
      ),
    ).toMatchObject({ allowed: true, moduleName: 'Public dashboard preview' })
    expect(
      getRouteAccess(
        'Project Manager',
        '/projects/project-beta/transparency/preview',
        projectManagerAssignments,
      ),
    ).toMatchObject({ allowed: false, moduleName: 'Public dashboard preview' })
    expect(
      getRouteAccess('Project Officer', '/projects/project-alpha/transparency/preview'),
    ).toMatchObject({ allowed: false, moduleName: 'Public dashboard preview' })
  })

  it('keeps Project Officer detailed reports limited while allowing aggregate survey results', () => {
    expect(getRouteAccess('Project Officer', '/reports')).toMatchObject({
      allowed: true,
      moduleName: 'Reports',
    })
    expect(getRouteAccess('Project Officer', '/reports/beneficiary-summary')).toMatchObject({
      allowed: true,
      moduleName: 'Beneficiary Summary',
    })
    expect(getRouteAccess('Project Officer', '/reports/project-summary')).toMatchObject({
      allowed: false,
      moduleName: 'Project Summary',
    })
    expect(getRouteAccess('Project Officer', '/reports/indicator-summary')).toMatchObject({
      allowed: false,
      moduleName: 'Indicator Summary',
    })
    expect(getRouteAccess('Project Officer', '/reports/survey-results')).toMatchObject({
      allowed: true,
      moduleName: 'Survey/Form Results',
    })
  })

  it('requires beneficiary step-up for authorized non-administrator roles', () => {
    expect(getRouteAccess('Project Manager', '/beneficiaries')).toMatchObject({
      allowed: true,
      requiresBeneficiaryStepUp: true,
    })
    expect(getRouteAccess('System Administrator', '/beneficiaries')).toMatchObject({
      allowed: true,
      requiresBeneficiaryStepUp: false,
    })
    expect(
      getRouteAccess(
        'Monitoring and Evaluation Officer',
        '/reports/preview?kind=beneficiary-summary',
      ),
    ).toMatchObject({
      allowed: true,
      requiresBeneficiaryStepUp: true,
    })
  })

  it.each([
    'Program Manager',
    'Project Manager',
    'Monitoring and Evaluation Officer',
    'Project Officer',
    'System Administrator',
  ] as const)('keeps Collection reachable for %s', (role) => {
    expect(getRouteAccess(role, '/collection')).toMatchObject({
      allowed: true,
      moduleName: 'Collection',
    })
  })

  it('keeps label settings in the System Administrator area', () => {
    expect(getRouteAccess('System Administrator', '/settings/labels')).toMatchObject({
      allowed: true,
      moduleName: 'Edit Labels',
    })
    expect(getRouteAccess('Program Manager', '/settings/labels')).toMatchObject({
      allowed: false,
      moduleName: 'Edit Labels',
    })
  })

  it('exposes User Management only to roles with account authority', () => {
    for (const role of ['System Administrator', 'Program Manager', 'Project Manager'] as const) {
      expect(getRouteAccess(role, '/settings/users')).toMatchObject({
        allowed: true,
        moduleName: 'User Management',
      })
    }

    for (const role of [
      'Project Officer',
      'Monitoring and Evaluation Officer',
      'Grant Manager',
    ] as const) {
      expect(getRouteAccess(role, '/settings/users')).toMatchObject({
        allowed: false,
        moduleName: 'User Management',
      })
    }
  })

  it('fails closed for protected routes without an explicit access rule', () => {
    expect(getRouteAccess('System Administrator', '/imports')).toMatchObject({
      allowed: false,
      moduleName: 'Workspace',
    })
  })
})
