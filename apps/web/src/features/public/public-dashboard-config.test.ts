import { describe, expect, it } from 'vitest'

import type { PublicDashboardPresentation } from '@/types/pathways'

import {
  PUBLIC_DONATE_CTA_LABEL,
  getPublicDashboardStorageKey,
  publicCtaDestinations,
  sanitizePublicDashboardPresentation,
} from './public-dashboard-config'

const presentation: PublicDashboardPresentation = {
  eyebrow: 'Project story',
  headline: 'Default headline',
  summaryTitle: 'Default summary title',
  summaryBody: 'Default public summary',
  quote: 'Default quote',
  quoteAttribution: 'Default attribution',
  closingTitle: 'Default closing title',
  closingText: 'Default closing text',
  secondaryCtaLabel: 'Browse projects',
  secondaryCtaHref: '/public/projects',
  layoutPreset: 'balanced',
  sectionOrder: ['overview', 'media', 'progress', 'indicators', 'milestones'],
  visibleSections: ['overview', 'media', 'progress', 'indicators', 'milestones'],
}

describe('public dashboard presentation configuration', () => {
  it('keeps safe copy, known public CTA destinations, and a valid custom section order', () => {
    expect(
      sanitizePublicDashboardPresentation(
        {
          ...presentation,
          headline: '  A donor-ready public story  ',
          secondaryCtaHref: '/',
          layoutPreset: 'compact',
          sectionOrder: ['progress', 'overview', 'unknown', 'progress'],
          visibleSections: ['progress', 'overview'],
        },
        presentation,
      ),
    ).toMatchObject({
      headline: 'A donor-ready public story',
      secondaryCtaHref: '/',
      layoutPreset: 'compact',
      sectionOrder: ['progress', 'overview', 'media', 'indicators', 'milestones'],
      visibleSections: ['progress', 'overview'],
    })
  })

  it('falls back from blank copy, unsafe destinations, and an empty visible layout', () => {
    expect(
      sanitizePublicDashboardPresentation(
        {
          headline: ' ',
          secondaryCtaHref: '/public/projects/futuremakers-ncr',
          layoutPreset: 'gallery-wall',
          visibleSections: [],
        },
        presentation,
      ),
    ).toMatchObject({
      headline: presentation.headline,
      secondaryCtaHref: presentation.secondaryCtaHref,
      layoutPreset: presentation.layoutPreset,
      visibleSections: presentation.visibleSections,
    })
  })

  it('uses a separate browser-local storage key for each project', () => {
    expect(getPublicDashboardStorageKey('futuremakers-ncr')).not.toBe(
      getPublicDashboardStorageKey('youth-rise-western-samar'),
    )
  })

  it('keeps Donate Now fixed and excludes project-to-project return destinations', () => {
    expect(PUBLIC_DONATE_CTA_LABEL).toBe('Donate Now')
    expect(publicCtaDestinations.every((item) => !item.href.startsWith('/public/projects/'))).toBe(
      true,
    )
  })
})
