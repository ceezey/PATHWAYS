import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { LabelSettingsWorkspace } from '@/features/settings/label-settings-workspace'

function LabelSettingsPage() {
  return <LabelSettingsWorkspace />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('labels', props)
  return LabelSettingsPage()
}
