import type { Metadata } from 'next'

import { PublicLandingPage } from '@/features/public/public-landing'

export const metadata: Metadata = { title: 'Home' }

export default function HomePage() {
  return <PublicLandingPage />
}
