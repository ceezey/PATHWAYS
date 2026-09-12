import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { CollectionWorkspace } from '@/features/collection/collection-workspace'

function NewCollectionFormPage() {
  return <CollectionWorkspace initialMode="scratch" initialView="builder" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('formCreate', props)
  return NewCollectionFormPage()
}
