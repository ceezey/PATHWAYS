// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FormEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UnavailableHint, unavailableControlProps } from './unavailable-hint'

afterEach(() => {
  cleanup()
})

describe('unavailableControlProps', () => {
  it('stays focusable and marks the control aria-disabled instead of native disabled', () => {
    render(
      <>
        <button type="button" {...unavailableControlProps('hint-1')}>
          Do the thing
        </button>
        <UnavailableHint id="hint-1" />
      </>,
    )

    const button = screen.getByRole('button', { name: 'Do the thing' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')

    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it('exposes the accessible description pointing at the UnavailableHint', () => {
    render(
      <>
        <button type="button" {...unavailableControlProps('hint-2', 'Custom reason')}>
          Do the thing
        </button>
        <UnavailableHint id="hint-2" message="Custom reason" />
      </>,
    )

    const button = screen.getByRole('button', { name: 'Do the thing' })
    const describedBy = button.getAttribute('aria-describedby')
    expect(describedBy).toBe('hint-2')
    expect(document.getElementById(describedBy as string)?.textContent).toBe('Custom reason')
    expect(button.getAttribute('title')).toBe('Custom reason')
  })

  it('blocks the caller-supplied onClick from running', () => {
    const onClick = vi.fn()
    const props = Object.assign(
      { onClick, type: 'button' as const },
      unavailableControlProps('hint-3'),
    )
    render(<button {...props}>Do the thing</button>)

    fireEvent.click(screen.getByRole('button', { name: 'Do the thing' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('blocks Enter/Space activation', () => {
    const onClick = vi.fn()
    const props = Object.assign(
      { onClick, type: 'button' as const },
      unavailableControlProps('hint-4'),
    )
    render(<button {...props}>Do the thing</button>)
    const button = screen.getByRole('button', { name: 'Do the thing' })
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: ' ' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('never submits a type="submit" control it is spread onto', () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <button type="submit" {...unavailableControlProps('hint-5')}>
          Save
        </button>
      </form>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
