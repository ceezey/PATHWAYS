import { DashboardShell } from '@/components/layout/dashboard-shell'
import { ProtectedRoute } from '@/components/layout/protected-route'

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProtectedRoute>
      <DashboardShell>{children}</DashboardShell>
    </ProtectedRoute>
  )
}
