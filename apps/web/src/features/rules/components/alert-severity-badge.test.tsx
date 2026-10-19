/* @vitest-environment jsdom */
import type { HumanAlert } from '@pathways/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AlertSeverityBadge } from './alert-severity-badge'

afterEach(cleanup)
const basis = (manualCritical: boolean) =>
  ({
    manualCritical,
    status: 'CLASSIFIED',
    level: 'HIGH',
  }) as unknown as HumanAlert['severityBasis']

describe('AlertSeverityBadge', () => {
  it('reads Needs context for a null severity', () => {
    render(<AlertSeverityBadge severity={null} basis={null} />)
    expect(screen.getByText('Needs context')).toBeTruthy()
  })
  it('names the manual judgment for a manual Critical', () => {
    render(<AlertSeverityBadge severity="CRITICAL" basis={basis(true)} />)
    expect(screen.getByText('Critical: manual judgment by rule author')).toBeTruthy()
  })
  it('shows the title-case level otherwise, including alerts without a basis', () => {
    render(<AlertSeverityBadge severity="MEDIUM" basis={basis(false)} />)
    render(<AlertSeverityBadge severity="HIGH" basis={null} />)
    expect(screen.getByText('Medium')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })
})
