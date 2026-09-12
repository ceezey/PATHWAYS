import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { CollectionWorkspace } from '@/features/collection/collection-workspace'

interface CollectionImportPageProps {
  searchParams: Promise<{
    mode?: string
  }>
}

async function CollectionImportPage({ searchParams }: CollectionImportPageProps) {
  const params = await searchParams
  const initialMode = params.mode === 'extend' ? 'extend' : 'import'

  return <CollectionWorkspace initialMode={initialMode} initialView="import" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('imports', props)
  return CollectionImportPage(props as Parameters<typeof CollectionImportPage>[0])
}
