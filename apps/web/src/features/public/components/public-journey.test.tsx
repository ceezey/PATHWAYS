/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HeroJourney } from './public-journey'

type Callback = (entries: { isIntersecting: boolean; target: Element }[]) => void

describe('hero journey', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('follows scrolled steps and jumps to a tapped step', () => {
    let notify: Callback = () => {}
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: Callback) {
          notify = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    Element.prototype.scrollIntoView = () => {}
    const { container } = render(<HeroJourney>hero copy</HeroJourney>)
    const steps = container.querySelectorAll('li[data-step]')
    expect(steps).toHaveLength(5)
    expect(steps[0].getAttribute('aria-current')).toBe('step')
    act(() => notify([{ isIntersecting: true, target: steps[2] }]))
    expect(steps[2].getAttribute('aria-current')).toBe('step')
    fireEvent.click(screen.getByRole('button', { name: /Step 4/ }))
    expect(steps[3].getAttribute('aria-current')).toBe('step')
    expect(steps[0].getAttribute('aria-current')).toBeNull()
  })
})
