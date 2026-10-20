/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RulePreview } from './rule-preview'

afterEach(cleanup)

const view = (name: string, critical: boolean) =>
  render(
    <RulePreview
      condition="Days past project end > 10 days"
      critical={critical}
      mode="alert"
      name={name}
      recommendation={undefined}
      sentence="Raise an alert when Days past project end is above 10 days. Human review required."
    />,
  )
const header = () => screen.getByText(/./, { selector: 'p.font-semibold' })

describe('RulePreview header', () => {
  it('shows only the rule name or Untitled rule, in a neutral tint', () => {
    view('  Late delivery  ', false)
    expect(header().textContent).toBe('Late delivery')
    expect(header().className).toContain('bg-muted')
    cleanup()
    view('', false)
    expect(header().textContent).toBe('Untitled rule')
  })
  it('adds the severity word and the danger tint only for Critical', () => {
    view('Late delivery', true)
    expect(header().textContent).toBe('Late delivery - Critical')
    expect(header().className).toContain('bg-danger-subtle')
  })
})
