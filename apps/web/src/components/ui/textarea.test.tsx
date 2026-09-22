// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Textarea } from './textarea'

describe('Textarea', () => {
  it('applies the governed visual states and forwards native semantics', () => {
    render(
      <Textarea
        aria-invalid="true"
        aria-label="Update note"
        disabled
        placeholder="Describe the update"
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Update note' })
    expect(textarea.className).toContain('border-input')
    expect(textarea.className).toContain('resize-y')
    expect(textarea.className).toContain('placeholder:text-muted-foreground')
    expect(textarea.className).toContain('focus-visible:ring-2')
    expect(textarea.className).toContain('aria-[invalid=true]:border-danger')
    expect((textarea as HTMLTextAreaElement).disabled).toBe(true)
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.getAttribute('placeholder')).toBe('Describe the update')
  })

  it('accepts keyboard focus when enabled', () => {
    render(<Textarea aria-label="Notes" />)
    const textarea = screen.getByRole('textbox', { name: 'Notes' })
    textarea.focus()
    expect(document.activeElement).toBe(textarea)
  })
})
