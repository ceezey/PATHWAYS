import { AccessRecovery } from '@/features/auth/access-recovery'

export const dynamic = 'force-dynamic'

/** No profile, domain data, route approval or automatic navigation on this page. */
export default function AccessUnavailablePage() {
  return <AccessRecovery />
}
