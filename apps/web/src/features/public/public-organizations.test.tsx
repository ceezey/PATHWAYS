/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PublicOrganizationsPage } from './public-organizations'

describe('public organizations page', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('lists each organization with links to its projects and its own site', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    render(<PublicOrganizationsPage />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Plan International Pilipinas' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: /View published projects/ }).getAttribute('href')).toBe(
      '/organizations/plan-international-pilipinas',
    )
    expect(screen.getByRole('link', { name: /Official website/ }).getAttribute('target')).toBe(
      '_blank',
    )
  })
})
