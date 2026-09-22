import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('projects', props)
  redirect('/projects')
}
