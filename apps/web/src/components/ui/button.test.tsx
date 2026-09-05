/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('uses the approved default target and governed interaction states', () => {
    render(<Button>Save changes</Button>)
    const button = screen.getByRole('button', { name: 'Save changes' })

    expect(button.className).toContain('h-11')
    expect(button.className).toContain('focus-visible:ring-2')
    expect(button.className).toContain('focus-visible:ring-offset-2')
    expect(button.className).toContain('active:translate-y-px')
  })

  it('keeps the approved dense control exception at 40 pixels', () => {
    render(<Button size="sm">Filter</Button>)
    expect(screen.getByRole('button', { name: 'Filter' }).className).toContain('h-10')
  })
})
