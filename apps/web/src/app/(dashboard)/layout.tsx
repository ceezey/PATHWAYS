import { cookies } from 'next/headers'

import { AppShell } from '@/components/layout/app-shell'
import { ProtectedRoute } from '@/components/layout/protected-route'
import { SIDEBAR_COOKIE, isSidebarCompact } from '@/components/layout/sidebar-preference'

export const dynamic = 'force-dynamic'

// Every protected page calls requireServerPage before its loader. Do not repeat
// a dashboard authorization request in this shared layout or wrap the shell in
// a content guard: layouts persist across navigation and are not data authority.

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const compact = isSidebarCompact((await cookies()).get(SIDEBAR_COOKIE)?.value)
  return (
    <AppShell initialCompact={compact}>
      <ProtectedRoute>{children}</ProtectedRoute>
    </AppShell>
  )
}
