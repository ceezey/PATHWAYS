import { AppShell } from '@/components/layout/app-shell'
import { ProtectedRoute } from '@/components/layout/protected-route'

export const dynamic = 'force-dynamic'

// Every protected page calls requireServerPage before its loader. Do not repeat
// a dashboard authorization request in this shared layout or wrap the shell in
// a content guard: layouts persist across navigation and are not data authority.

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppShell>
      <ProtectedRoute>{children}</ProtectedRoute>
    </AppShell>
  )
}
