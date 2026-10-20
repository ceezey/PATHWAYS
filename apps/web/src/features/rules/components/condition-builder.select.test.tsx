/* @vitest-environment jsdom */
import type { RuleCondition } from '@pathways/shared'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConditionBuilder } from './condition-builder'

// Passthrough select: renders each item's own props and hint, as Radix spreads item props onto the option.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    children,
    hint,
    value: _value,
    ...props
  }: { children: ReactNode; hint?: ReactNode; value: string } & Record<string, unknown>) => (
    <div data-option="" {...props}>
      {children}
      {hint}
    </div>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}))
afterEach(cleanup)

const row: RuleCondition = {
  kind: 'CONDITION',
  id: 'a',
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '0',
}

describe('ConditionBuilder preferred operators', () => {
  it('describes a preferred option as Preferred condition and leaves others undescribed', () => {
    render(
      <ConditionBuilder
        activities={[]}
        expectations={{}}
        indicators={[]}
        joins={{}}
        rows={[row]}
        scopeProjectId={null}
        scopes={['Project']}
        setJoins={() => {}}
        setRows={() => {}}
        onAdvanced={() => {}}
      />,
    )
    const options = [...document.querySelectorAll<HTMLElement>('[data-option]')]
    const described = options.filter((option) => option.getAttribute('aria-describedby'))
    expect(described.length).toBeGreaterThan(0)
    expect(described.length).toBeLessThan(options.length)
    for (const option of described) {
      const id = option.getAttribute('aria-describedby') as string
      expect(document.getElementById(id)?.textContent).toBe('Preferred condition')
      expect(option.getAttribute('title')).toBeNull()
    }
  })
})
