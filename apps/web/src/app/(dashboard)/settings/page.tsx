import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { redirect } from 'next/navigation'

function SettingsCompatibilityPage() {
  redirect('/settings/users')
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('settings', props)
  return SettingsCompatibilityPage()
}
