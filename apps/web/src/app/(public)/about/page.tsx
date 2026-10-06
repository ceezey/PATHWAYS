import type { Metadata } from 'next'

import { PublicAboutPage } from '@/features/public/public-about'

export const metadata: Metadata = { title: 'About Us' }

export default function AboutPage() {
  return <PublicAboutPage />
}
