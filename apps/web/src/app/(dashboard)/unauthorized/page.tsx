import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { UnauthorizedState } from '@/components/layout/unauthorized-state'

function UnauthorizedPage() {
  return <UnauthorizedState moduleName="the requested module" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('unauthorized', props)
  return UnauthorizedPage()
}
