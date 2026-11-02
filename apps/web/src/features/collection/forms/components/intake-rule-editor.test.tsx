/* @vitest-environment jsdom */
import type { FieldIntakeRule } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IntakeRuleEditor } from './intake-rule-editor'

afterEach(cleanup)

const show = (rule: FieldIntakeRule | null, onChange = vi.fn()) =>
  render(
    <IntakeRuleEditor
      idPrefix="rule"
      fieldCode="total_score"
      fieldCodes={['total_score', 'q1']}
      rule={rule}
      readOnly={false}
      onChange={onChange}
    />,
  )
const kinds = () =>
  within(screen.getByLabelText('Calculation or check'))
    .getAllByRole('option')
    .map((option) => option.getAttribute('value'))

describe('IntakeRuleEditor', () => {
  it('keeps and shows a TOTAL_SCORE rule', () => {
    show({ kind: 'TOTAL_SCORE', questions: [{ field: 'q1', anyAnswer: true }] })
    expect(kinds()).toContain('TOTAL_SCORE')
    expect((screen.getByLabelText('Calculation or check') as HTMLSelectElement).value).toBe(
      'TOTAL_SCORE',
    )
  })

  it('does not offer TOTAL_SCORE to a field that has none', () => {
    show(null)
    expect(kinds()).not.toContain('TOTAL_SCORE')
  })

  it('clears the key only when the person picks another kind', () => {
    const onChange = vi.fn()
    show({ kind: 'TOTAL_SCORE', questions: [{ field: 'q1', anyAnswer: true }] }, onChange)
    fireEvent.change(screen.getByLabelText('Calculation or check'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
