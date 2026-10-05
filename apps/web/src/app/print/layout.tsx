import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Report', robots: { index: false, follow: false } }

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return children
}
