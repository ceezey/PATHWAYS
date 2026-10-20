/* @vitest-environment jsdom */
import type { HumanAlert, SeverityBasis } from '@pathways/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SeverityBasisPanel } from './severity-basis-panel'

afterEach(cleanup)
const basis = (patch: Partial<SeverityBasis>): SeverityBasis => ({
  criteriaVersion: 'severity-guide-v0.2',
  status: 'CLASSIFIED',
  level: 'HIGH',
  supportedLevel: null,
  decisiveConditionId: null,
  combination: null,
  manualCritical: false,
  conditions: [],
  missing: [],
  unchecked: [],
  ...patch,
})
const alert = (patch: Partial<HumanAlert>): HumanAlert =>
  ({ severity: 'HIGH', severityBasis: basis({}), severityChange: null, ...patch }) as HumanAlert
const change = (from: string | null, to: string, previous: SeverityBasis) =>
  ({ from, to, at: '2026-10-22T02:00:00.000Z', previous }) as HumanAlert['severityChange']

describe('SeverityBasisPanel', () => {
  it('shows the heading, headline and reason on the page', () => {
    render(<SeverityBasisPanel alert={alert({})} />)
    expect(screen.getByRole('heading', { name: 'Why this level' })).toBeTruthy()
    expect(screen.getByText('Suggested severity: High.')).toBeTruthy()
    expect(screen.getByText(/Severity Guide v0\.2/)).toBeTruthy()
  })
  it('lists what is missing for a Needs context alert', () => {
    render(
      <SeverityBasisPanel
        alert={alert({
          severity: null,
          severityBasis: basis({
            status: 'CONTEXT_REQUIRED',
            level: null,
            missing: ['PROJECT_DATES'],
          }),
        })}
      />,
    )
    expect(screen.getByText('Needs context.')).toBeTruthy()
    expect(screen.getByText('We need valid project start and end dates.')).toBeTruthy()
  })
  it('words a change between levels', () => {
    render(
      <SeverityBasisPanel
        alert={alert({
          severityChange: change('MEDIUM', 'HIGH', basis({ level: 'MEDIUM' })),
        })}
      />,
    )
    expect(screen.getByText('Raised from Medium to High on 22 Oct')).toBeTruthy()
  })
  it('words a lowered change', () => {
    render(
      <SeverityBasisPanel
        alert={alert({ severityChange: change('HIGH', 'LOW', basis({ level: 'HIGH' })) })}
      />,
    )
    expect(screen.getByText('Lowered from High to Low on 22 Oct')).toBeTruthy()
  })
  it('words a change to or from Needs context', () => {
    render(
      <SeverityBasisPanel
        alert={alert({
          severityChange: change(null, 'HIGH', basis({ level: null, status: 'CONTEXT_REQUIRED' })),
        })}
      />,
    )
    expect(screen.getByText('Changed from Needs context to High on 22 Oct')).toBeTruthy()
  })
  it('shows the system suggestion beside a manual Critical and words its change by suggestion', () => {
    render(
      <SeverityBasisPanel
        alert={alert({
          severity: 'CRITICAL',
          severityBasis: basis({ manualCritical: true, level: 'HIGH' }),
          severityChange: change('CRITICAL', 'CRITICAL', basis({ level: 'MEDIUM' })),
        })}
      />,
    )
    expect(screen.getByText('System suggestion: High')).toBeTruthy()
    expect(screen.getByText('System suggestion raised from Medium to High on 22 Oct')).toBeTruthy()
  })
  it('shows only the stored level when there is no basis', () => {
    render(<SeverityBasisPanel alert={alert({ severityBasis: null })} />)
    expect(screen.getByText('Stored level: High')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Why this level' })).toBeNull()
  })
})
