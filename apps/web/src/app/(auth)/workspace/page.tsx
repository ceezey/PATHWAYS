import { requireServerRoute } from '@/lib/rbac/server-access'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  await requireServerRoute({ route: 'dashboard' })
  redirect('/dashboard')
}
