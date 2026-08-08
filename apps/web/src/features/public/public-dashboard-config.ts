import type {
  PublicDashboardLayoutPreset,
  PublicDashboardPresentation,
  PublicDashboardSectionId,
} from '@/types/pathways'

export const PUBLIC_DASHBOARD_STORAGE_KEY = 'pathways.publicDashboardCustomization'

export const getPublicDashboardStorageKey = (projectId: string) =>
  `${PUBLIC_DASHBOARD_STORAGE_KEY}.${projectId}`

export const publicDashboardSections: ReadonlyArray<{
  id: PublicDashboardSectionId
  label: string
  description: string
}> = [
  {
    id: 'overview',
    label: 'Project overview',
    description: 'Approved summary, project areas, and timeframe',
  },
  {
    id: 'media',
    label: 'Approved project media',
    description: 'Safe, non-identifying mock media approved for public presentation',
  },
  {
    id: 'progress',
    label: 'Progress story',
    description: 'Aggregate reach, assessment, budget, and progress trend',
  },
  {
    id: 'indicators',
    label: 'Selected indicators',
    description: 'Approved project-level indicator progress',
  },
  {
    id: 'milestones',
    label: 'Milestones and accomplishments',
    description: 'Public milestones and approved accomplishment highlights',
  },
]

export const publicDashboardLayoutPresets: ReadonlyArray<{
  id: PublicDashboardLayoutPreset
  label: string
  description: string
}> = [
  {
    id: 'story-led',
    label: 'Story-led',
    description: 'Roomier sections and a wider media-led presentation.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'An even mix of narrative, media, and project progress.',
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Tighter cards and spacing for concise project updates.',
  },
]

export const PUBLIC_DONATE_CTA_LABEL = 'Donate Now'

export const publicCtaDestinations = [
  { href: '/', label: 'Public dashboard home' },
  { href: '/public/projects', label: 'All public projects' },
] as const

const sectionIds = publicDashboardSections.map((section) => section.id)
const allowedSectionIds = new Set<string>(sectionIds)
const allowedCtaDestinations = new Set<string>(publicCtaDestinations.map((item) => item.href))
const allowedLayoutPresets = new Set<PublicDashboardLayoutPreset>(
  publicDashboardLayoutPresets.map((preset) => preset.id),
)

const cleanText = (value: unknown, fallback: string, maxLength: number) => {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback
  }

  return value.trim().slice(0, maxLength)
}

const cleanDestination = (value: unknown, fallback: string) =>
  typeof value === 'string' && allowedCtaDestinations.has(value) ? value : fallback

const cleanLayoutPreset = (
  value: unknown,
  fallback: PublicDashboardLayoutPreset,
): PublicDashboardLayoutPreset =>
  typeof value === 'string' && allowedLayoutPresets.has(value as PublicDashboardLayoutPreset)
    ? (value as PublicDashboardLayoutPreset)
    : fallback

const cleanSectionList = (
  value: unknown,
  fallback: PublicDashboardSectionId[],
  appendMissing: boolean,
) => {
  if (!Array.isArray(value)) {
    return fallback
  }

  const sanitized = value.reduce<PublicDashboardSectionId[]>((items, item) => {
    if (
      typeof item === 'string' &&
      allowedSectionIds.has(item) &&
      !items.includes(item as PublicDashboardSectionId)
    ) {
      items.push(item as PublicDashboardSectionId)
    }

    return items
  }, [])

  if (!appendMissing) {
    return sanitized.length > 0 ? sanitized : fallback
  }

  return [...sanitized, ...fallback.filter((item) => !sanitized.includes(item))]
}

export const sanitizePublicDashboardPresentation = (
  value: unknown,
  fallback: PublicDashboardPresentation,
): PublicDashboardPresentation => {
  const candidate =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  return {
    eyebrow: cleanText(candidate.eyebrow, fallback.eyebrow, 52),
    headline: cleanText(candidate.headline, fallback.headline, 140),
    summaryTitle: cleanText(candidate.summaryTitle, fallback.summaryTitle, 100),
    summaryBody: cleanText(candidate.summaryBody, fallback.summaryBody, 420),
    quote: cleanText(candidate.quote, fallback.quote, 280),
    quoteAttribution: cleanText(candidate.quoteAttribution, fallback.quoteAttribution, 90),
    closingTitle: cleanText(candidate.closingTitle, fallback.closingTitle, 100),
    closingText: cleanText(candidate.closingText, fallback.closingText, 280),
    secondaryCtaLabel: cleanText(candidate.secondaryCtaLabel, fallback.secondaryCtaLabel, 48),
    secondaryCtaHref: cleanDestination(candidate.secondaryCtaHref, fallback.secondaryCtaHref),
    layoutPreset: cleanLayoutPreset(candidate.layoutPreset, fallback.layoutPreset),
    sectionOrder: cleanSectionList(candidate.sectionOrder, fallback.sectionOrder, true),
    visibleSections: cleanSectionList(candidate.visibleSections, fallback.visibleSections, false),
  }
}
