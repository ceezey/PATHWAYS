// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PageHeadingEditor } from './page-heading-editor'

afterEach(() => {
  cleanup()
  vi.doUnmock('@/constants/feature-flags')
  vi.resetModules()
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

  it('opens no dialog when clicked', () => {
    render(<PageHeadingEditor labelKey="moduleProjects" title="Projects" />)

    const button = screen.getByRole('button', { name: 'Edit Projects page heading' })
    button.click()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })

  it('renders nothing while unfinished controls are hidden', async () => {
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({ UNFINISHED_CONTROLS_UI_ENABLED: false }))
    const { PageHeadingEditor: HiddenEditor } = await import('./page-heading-editor')
    const { container } = render(<HiddenEditor labelKey="moduleProjects" title="Projects" />)

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button', { name: 'Edit Projects page heading' })).toBeNull()
    expect(screen.queryByText('Not available yet')).toBeNull()
  })
})
