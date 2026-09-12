import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { CollectionWorkspace } from '@/features/collection/collection-workspace'

function CollectionFormsPage() {
  return <CollectionWorkspace initialMode="scratch" initialView="forms" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('forms', props)
  return CollectionFormsPage()
}
