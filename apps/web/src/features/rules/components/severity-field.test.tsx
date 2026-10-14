/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SeverityField } from './severity-field'

afterEach(cleanup)

describe('SeverityField', () => {
  it.each([
    ['LOW', 'MEDIUM', /^Low/],
    ['MEDIUM', 'LOW', /^Medium/],
    ['HIGH', 'LOW', /^High/],
    ['CRITICAL', 'LOW', /^Critical/],
  ] as const)('reports %s when that severity is chosen', (value, current, name) => {
    const onSeverity = vi.fn()
    render(<SeverityField mode="alert" onSeverity={onSeverity} severity={current} />)
    fireEvent.click(screen.getByRole('radio', { name }))
    expect(onSeverity).toHaveBeenCalledOnce()
    expect(onSeverity).toHaveBeenCalledWith(value)
  })
  it('checks only the current severity and does not report choosing it again', () => {
    const onSeverity = vi.fn()
    render(<SeverityField mode="alert" onSeverity={onSeverity} severity="HIGH" />)
    const checked = screen
      .getAllByRole('radio')
      .filter((radio) => (radio as HTMLInputElement).checked)
    expect(checked.map((radio) => (radio as HTMLInputElement).value)).toEqual(['HIGH'])
    fireEvent.click(screen.getByRole('radio', { name: /^High/ }))
    expect(onSeverity).not.toHaveBeenCalled()
  })
})
