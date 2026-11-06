import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { CollectionWorkspace, ImportWorkspace } from '@/features/collection'

function CollectionImportPage({
  extend,
  target,
}: {
  extend: boolean
  target?: { projectId: string; batchId: string }
}) {
  return extend ? (
    <CollectionWorkspace initialMode="extend" initialView="import" />
  ) : (
    <ImportWorkspace target={target} />
  )
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('imports', props)
  const { mode, project, batch } = (await props.searchParams) ?? {}
  // The workspace opens these only if they are in the lists the server gave this person.
  const target =
    typeof project === 'string' && typeof batch === 'string'
      ? { projectId: project, batchId: batch }
      : undefined
  return <CollectionImportPage extend={mode === 'extend'} target={target} />
}
