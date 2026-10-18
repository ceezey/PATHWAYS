import type { Metadata } from 'next'

import { PublicAboutPage } from '@/features/public'

export const metadata: Metadata = { title: 'About Us' }

export default function AboutPage() {
  return <PublicAboutPage />
}
