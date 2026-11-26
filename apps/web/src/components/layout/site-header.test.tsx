/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SiteHeader } from './site-header'

vi.mock('next/navigation', () => ({ usePathname: () => '/staff/login' }))

const hrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'))

describe('SiteHeader', () => {
  afterEach(() => cleanup())

  it('keeps public links relative on the public address', () => {
    render(<SiteHeader />)
    expect(hrefs()).toEqual(expect.arrayContaining(['/', '/about', '/organizations']))
  })

  it('points public links at the public address from the staff sign-in pages', () => {
    render(<SiteHeader publicSiteUrl="https://pathways.example.org/" />)
    const links = hrefs()
    expect(links).toEqual(
      expect.arrayContaining([
        'https://pathways.example.org/',
        'https://pathways.example.org/about',
        'https://pathways.example.org/organizations',
      ]),
    )
    expect(links.every((href) => href?.startsWith('https://pathways.example.org/'))).toBe(true)
  })
})
