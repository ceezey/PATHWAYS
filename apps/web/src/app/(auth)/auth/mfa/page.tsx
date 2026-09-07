import type { Metadata } from 'next'

import { MfaForm } from '@/features/auth/mfa-form'

export const metadata: Metadata = {
  title: 'Developer MFA | PATHWAYS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function MfaPage() {
  return <MfaForm />
}
