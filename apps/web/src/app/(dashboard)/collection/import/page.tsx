import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { CollectionWorkspace } from '@/features/collection/collection-workspace'
import { ImportWorkspace } from '@/features/collection/import-workspace'

function CollectionImportPage({ extend }: { extend: boolean }) {
  return extend ? (
    <CollectionWorkspace initialMode="extend" initialView="import" />
  ) : (
    <ImportWorkspace />
  )
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('imports', props)
  const mode = (await props.searchParams)?.mode
  return <CollectionImportPage extend={mode === 'extend'} />
}
