import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { CollectionWorkspace } from '@/features/collection/collection-workspace'

function CollectionPage() {
  return <CollectionWorkspace initialMode="scratch" initialView="home" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('collection', props)
  return CollectionPage()
}
