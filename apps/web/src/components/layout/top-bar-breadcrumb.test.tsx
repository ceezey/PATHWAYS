import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TopBarBreadcrumb } from './top-bar-breadcrumb'

describe('TopBarBreadcrumb', () => {
  afterEach(() => cleanup())

  it('links Alerts back to its root and names the Alert Repository sub-page', () => {
    render(<TopBarBreadcrumb label="Alerts" pathname="/alerts/repository" />)
    expect(screen.getByRole('link', { name: 'Alerts' }).getAttribute('href')).toBe('/alerts')
    expect(screen.getByText('Alert Repository')).toBeTruthy()
  })

  it('shows only the section name on the section root', () => {
    render(<TopBarBreadcrumb label="Alerts" pathname="/alerts" />)
    expect(screen.queryByText('Alert Repository')).toBeNull()
  })
})
