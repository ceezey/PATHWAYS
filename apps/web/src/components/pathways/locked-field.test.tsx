/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LockedField, lockedFieldMessage } from './locked-field'

afterEach(cleanup)

describe('LockedField', () => {
  it('uses the approved reason copy', () => {
    expect(lockedFieldMessage).toBe('You are not authorized to change this field')
  })

  it('renders a labelled, unchangeable control that shows the readable value', () => {
    render(<LockedField label="Activity budget" value="PHP 10,000.00" />)
    const control = screen.getByRole('textbox', { name: 'Activity budget' }) as HTMLInputElement
    expect(control.value).toBe('PHP 10,000.00')
    expect(control.readOnly).toBe(true)
    expect(control.getAttribute('aria-disabled')).toBe('true')
    // Not a form field: no name, so a submitted form never carries it.
    expect(control.getAttribute('name')).toBeNull()
    fireEvent.change(control, { target: { value: '1' } })
    expect(control.value).toBe('PHP 10,000.00')
  })

  it('stays keyboard-focusable and describes the reason to assistive technology', () => {
    render(<LockedField label="Connected indicators" multiline value={'IND-1\nIND-2'} />)
    const control = screen.getByRole('textbox', { name: 'Connected indicators' })
    control.focus()
    expect(document.activeElement).toBe(control)
    const describedBy = control.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const reason = document.getElementById(describedBy ?? '')
    expect(reason?.textContent).toBe(lockedFieldMessage)
    expect(reason?.getAttribute('role')).toBe('tooltip')
  })

  it('shows the tooltip on hover and keyboard focus, and Escape dismisses it in place', () => {
    render(<LockedField label="Project budget (PHP)" value="" />)
    const control = screen.getByRole('textbox', { name: 'Project budget (PHP)' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.getAttribute('data-state')).toBe('closed')

    fireEvent.mouseEnter(control)
    expect(tooltip.getAttribute('data-state')).toBe('open')
    expect(tooltip.textContent).toBe('You are not authorized to change this field')
    fireEvent.mouseLeave(control)
    expect(tooltip.getAttribute('data-state')).toBe('closed')

    fireEvent.focus(control)
    expect(tooltip.getAttribute('data-state')).toBe('open')
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(tooltip.getAttribute('data-state')).toBe('closed')
    fireEvent.blur(control)
    expect(tooltip.getAttribute('data-state')).toBe('closed')
  })
})
