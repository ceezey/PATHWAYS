import { CollectionWorkspace } from '@/features/collection/collection-workspace'

interface CollectionImportPageProps {
  searchParams: Promise<{
    mode?: string
  }>
}

export default async function CollectionImportPage({ searchParams }: CollectionImportPageProps) {
  const params = await searchParams
  const initialMode = params.mode === 'extend' ? 'extend' : 'import'

  return <CollectionWorkspace initialMode={initialMode} initialView="import" />
}
