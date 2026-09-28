// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PageHeadingEditor } from './page-heading-editor'

afterEach(() => {
  cleanup()
})

describe('PageHeadingEditor', () => {
  it('renders a focusable, aria-disabled pencil control with the Not available yet hint', () => {
    render(<PageHeadingEditor labelKey="moduleProjects" title="Projects" />)

    const button = screen.getByRole('button', { name: 'Edit Projects page heading' })
    // Native `disabled` would remove the control from the tab order, hiding
    // the hint from keyboard/screen-reader users, so it must stay focusable.
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('title')).toBe('Not available yet')
    button.focus()
    expect(document.activeElement).toBe(button)

    const describedBy = button.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const hint = document.getElementById(describedBy as string)
    expect(hint).not.toBeNull()
    expect(hint?.textContent).toBe('Not available yet')
    expect(hint?.className).toContain('sr-only')
  })

  it('does not render a dialog', () => {
    render(<PageHeadingEditor labelKey="moduleProjects" title="Projects" />)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Edit page heading')).toBeNull()
  })

  it('opens no dialog when clicked', () => {
    render(<PageHeadingEditor labelKey="moduleProjects" title="Projects" />)

    const button = screen.getByRole('button', { name: 'Edit Projects page heading' })
    button.click()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })
})
