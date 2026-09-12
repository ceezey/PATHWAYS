import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { redirect } from 'next/navigation'

function RulesCompatibilityPage() {
  redirect('/alerts/repository')
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('settingsRules', props)
  return RulesCompatibilityPage()
}
