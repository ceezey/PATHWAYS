import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { webEnv } from '@/lib/env'
import type { PublicProjectRecord } from '@/types/pathways'
import { z } from 'zod'

const snapshot = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(300),
    code: z.string().max(100),
    approvedSummary: z.string().min(1).max(4000),
    area: z.string().nullable(),
    sector: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    publishedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type PublicProjectSnapshot = z.infer<typeof snapshot>

export function mapPublicSnapshot(input: unknown): PublicProjectRecord {
  const row = snapshot.parse(input)
  return {
    id: row.id,
    title: row.title,
    tagline: row.code,
    area: row.area ?? 'Not specified',
    sector: row.sector ?? 'Not specified',
    timeframe:
      row.startDate && row.endDate
        ? `${row.startDate.slice(0, 10)} to ${row.endDate.slice(0, 10)}`
        : 'Not specified',
    approvedSummary: row.approvedSummary,
    description: row.approvedSummary,
    aboutProject: row.approvedSummary,
    projectAreas: row.area ? [row.area] : [],
    selectedIndicators: [],
    milestones: [],
    accomplishments: [],
    progressTrend: [],
    beneficiariesReached: null,
    budgetSummary: 'Not available for public viewing.',
    assessmentSummary: 'Not available for public viewing.',
    publicationState: 'Approved for public preview',
    approvedMedia: [],
    publicPresentation: {
      eyebrow: 'Approved project summary',
      headline: row.title,
      summaryTitle: 'About this project',
      summaryBody: row.approvedSummary,
      quote: '',
      quoteAttribution: '',
      closingTitle: 'Explore approved projects',
      closingText: 'Read the approved summaries of our community projects.',
      secondaryCtaLabel: 'All public projects',
      secondaryCtaHref: '/public/projects',
      layoutPreset: 'balanced',
      sectionOrder: ['overview', 'media', 'progress', 'indicators', 'milestones'],
      visibleSections: ['overview'],
    },
  }
}

// Reads the allowlisted public snapshots; throws PUBLIC_NOT_FOUND or PUBLIC_UNAVAILABLE.
export async function readPublicSnapshots(projectId?: string): Promise<PublicProjectSnapshot[]> {
  if (projectId && !z.string().uuid().safeParse(projectId).success)
    throw new Error('PUBLIC_NOT_FOUND')
  const base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  const url = `${base.toString().replace(/\/$/, '')}/public/projects${projectId ? `/${projectId}` : '?limit=100'}`
  // Anonymous reads never carry a staff bearer token, workspace context, cookies, or redirects.
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(10000),
  })
  if (response.status === 404) throw new Error('PUBLIC_NOT_FOUND')
  if (!response.ok) throw new Error('PUBLIC_UNAVAILABLE')
  const text = await response.text()
  if (text.length > 1_000_000) throw new Error('PUBLIC_UNAVAILABLE')
  const value: unknown = JSON.parse(text)
  return projectId ? [snapshot.parse(value)] : z.array(snapshot).max(100).parse(value)
}

export async function readPublicProjects(projectId?: string): Promise<PublicProjectRecord[]> {
  return (await readPublicSnapshots(projectId)).map(mapPublicSnapshot)
}
