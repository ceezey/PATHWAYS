// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PageHeadingEditor } from './page-heading-editor'

afterEach(() => {
  cleanup()
  vi.doUnmock('@/constants/feature-flags')
  vi.resetModules()
})

const loadEditor = async (flags: Record<string, boolean>) => {
  vi.resetModules()
  vi.doMock('@/constants/feature-flags', () => flags)
  return (await import('./page-heading-editor')).PageHeadingEditor
}
const shownFlags = { UNFINISHED_CONTROLS_UI_ENABLED: true, PAGE_HEADING_EDITOR_UI_ENABLED: true }

describe('PageHeadingEditor', () => {
  it('renders nothing with the shipped flags', () => {
    const { container } = render(<PageHeadingEditor labelKey="moduleProjects" title="Projects" />)

    expect(container.innerHTML).toBe('')
  })

  it('renders a focusable, aria-disabled pencil control with the Not available yet hint', async () => {
    const Editor = await loadEditor(shownFlags)
    render(<Editor labelKey="moduleProjects" title="Projects" />)

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

  it('opens no dialog when clicked', async () => {
    const Editor = await loadEditor(shownFlags)
    render(<Editor labelKey="moduleProjects" title="Projects" />)

    const button = screen.getByRole('button', { name: 'Edit Projects page heading' })
    button.click()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })

  it.each([
    { UNFINISHED_CONTROLS_UI_ENABLED: false, PAGE_HEADING_EDITOR_UI_ENABLED: true },
    { UNFINISHED_CONTROLS_UI_ENABLED: true, PAGE_HEADING_EDITOR_UI_ENABLED: false },
  ])('renders nothing while either flag is off: %j', async (flags) => {
    const HiddenEditor = await loadEditor(flags)
    const { container } = render(<HiddenEditor labelKey="moduleProjects" title="Projects" />)

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button', { name: 'Edit Projects page heading' })).toBeNull()
    expect(screen.queryByText('Not available yet')).toBeNull()
  })
})
