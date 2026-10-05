/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HeroJourney } from './public-journey'

describe('hero journey', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('switches the shown step when a step is tapped on narrow screens', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    render(<HeroJourney>hero copy</HeroJourney>)
    const steps = screen.getAllByRole('button', { name: /^Step \d/ })
    expect(steps).toHaveLength(5)
    expect(steps[0].getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(steps[3])
    expect(steps[3].getAttribute('aria-expanded')).toBe('true')
    expect(steps[0].getAttribute('aria-expanded')).toBe('false')
    const shown = screen.getByRole('heading', { name: 'Keep decisions with the right people.' })
    expect(shown.closest('[aria-hidden="true"]')).toBeNull()
  })
})
