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
    ['Program Manager', 'transparency.publish', false],
    ['System Administrator', 'rules.configure', true],
    ['System Administrator', 'budget.expense.approve', false],
  ] as const)('%s permission %s is %s', (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected)
  })

  it('denies direct routes for disallowed modules', () => {
    expect(
      getRouteAccess('Project Officer', '/projects/futuremakers-ncr/monitor-evaluate'),
    ).toMatchObject({
      allowed: false,
      moduleName: 'Monitor & Evaluate',
    })
    expect(getRouteAccess('Monitoring and Evaluation Officer', '/settings/rules')).toMatchObject({
      allowed: true,
      moduleName: 'Rule center',
    })
    expect(getRouteAccess('Project Officer', '/settings/rules')).toMatchObject({
      allowed: false,
      moduleName: 'Rule center',
    })
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
})
