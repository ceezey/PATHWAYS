import type { Metadata } from 'next'

import { SkipLink } from '@/components/layout/skip-link'
import { AccountRecoveryWorkspace } from '@/features/auth/account-recovery-workspace'

export const metadata: Metadata = { title: 'Recover Staff Account' }

export default function StaffRecoveryPage() {
  return (
    <>
      <SkipLink />
      <AccountRecoveryWorkspace />
    </>
  )
}
