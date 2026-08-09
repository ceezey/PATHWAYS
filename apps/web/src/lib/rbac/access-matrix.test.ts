import { describe, expect, it } from 'vitest'

import { can } from './can'
import { getRouteAccess } from './route-access'

describe('Phase 10.5 RBAC matrix', () => {
  it.each([
    ['Project Officer', 'budget.expense.log', true],
    ['Project Officer', 'monitor_evaluate.view', false],
    ['Project Officer', 'reports.view', true],
    ['Project Officer', 'reports.beneficiary_summary.view', true],
    ['Project Officer', 'reports.project_summary.view', false],
    ['Project Officer', 'reports.indicator_summary.view', false],
    ['Monitoring and Evaluation Officer', 'budget.expense.verify', true],
    ['Monitoring and Evaluation Officer', 'alerts.outcome.log', false],
    ['Project Manager', 'evaluation.approve', true],
    ['Project Manager', 'evaluation.formal.submit', false],
    ['Program Manager', 'budget.portfolio_view', true],
    ['Program Manager', 'activities.view', true],
    ['Program Manager', 'collection.view', true],
    ['Program Manager', 'transparency.preview', true],
    ['Program Manager', 'transparency.publish', false],
    ['System Administrator', 'rules.configure', true],
    ['System Administrator', 'collection.view', true],
    ['System Administrator', 'budget.expense.approve', false],
  ] as const)('%s permission %s is %s', (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected)
  })

  it('denies direct routes for disallowed modules', () => {
    expect(
      getRouteAccess('Program Manager', '/projects/futuremakers-ncr/activities'),
    ).toMatchObject({
      allowed: true,
      moduleName: 'Activities',
    })
    expect(
      getRouteAccess('Project Officer', '/projects/futuremakers-ncr/monitor-evaluate'),
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

  it('limits the staff public-dashboard preview to designated internal roles', () => {
    expect(
      getRouteAccess('Program Manager', '/projects/futuremakers-ncr/transparency/preview'),
    ).toMatchObject({ allowed: true, moduleName: 'Public dashboard preview' })
    expect(
      getRouteAccess('Project Manager', '/projects/futuremakers-ncr/transparency/preview'),
    ).toMatchObject({ allowed: true, moduleName: 'Public dashboard preview' })
    expect(
      getRouteAccess('Project Officer', '/projects/futuremakers-ncr/transparency/preview'),
    ).toMatchObject({ allowed: false, moduleName: 'Public dashboard preview' })
  })

  it('limits Project Officer reports to beneficiary summary', () => {
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

  it('keeps browser-local label settings in the System Administrator area', () => {
    expect(getRouteAccess('System Administrator', '/settings/labels')).toMatchObject({
      allowed: true,
      moduleName: 'Edit Labels',
    })
    expect(getRouteAccess('Program Manager', '/settings/labels')).toMatchObject({
      allowed: false,
      moduleName: 'Edit Labels',
    })
  })

  it('keeps prototype user management discoverable only in the administration area', () => {
    expect(getRouteAccess('System Administrator', '/settings/users')).toMatchObject({
      allowed: true,
      moduleName: 'User Management',
    })
    expect(getRouteAccess('Program Manager', '/settings/users')).toMatchObject({
      allowed: false,
      moduleName: 'User Management',
    })
  })
})
