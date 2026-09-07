import type { Metadata } from 'next'

import { OwnProfileWorkspace } from '@/features/profile/own-profile-workspace'

export const metadata: Metadata = { title: 'My Profile' }

export default function ProfileSettingsPage() {
  return <OwnProfileWorkspace />
}
