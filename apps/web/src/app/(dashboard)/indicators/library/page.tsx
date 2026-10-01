import type { Metadata } from 'next'

import { IndicatorLibraryManager } from '@/features/projects/indicator-library-manager'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Indicator library' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('indicatorLibrary', props)
  return <IndicatorLibraryManager />
}
