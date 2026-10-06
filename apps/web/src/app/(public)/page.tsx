import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { PublicLandingPage } from '@/features/public/public-landing'

export const metadata: Metadata = { title: 'Home' }

type HomePageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function HomePage({ searchParams }: HomePageProps) {
  // Supabase falls back to the site URL when a recovery link fails, so route that to the recovery error page.
  if ((await searchParams).error_code) redirect('/auth/recovery/error')
  return <PublicLandingPage />
}
