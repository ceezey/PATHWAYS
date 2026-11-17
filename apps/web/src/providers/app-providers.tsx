'use client'

import { Toaster } from '@/components/ui/sonner'
import { UatMissionWidget } from '@/features/uat-mission/uat-mission-widget'
import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { CurrentRoleProvider } from '@/providers/current-role-provider'
import { DisplayLabelsProvider } from '@/providers/display-labels-provider'
import { QueryProvider } from '@/providers/query-provider'
import { SessionProvider } from '@/providers/session-provider'

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryProvider>
    <SessionProvider>
      <DisplayLabelsProvider>
        <CurrentRoleProvider>
          <AuthorizedQueryProvider>{children}</AuthorizedQueryProvider>
          <Toaster richColors position="top-right" />
          <UatMissionWidget />
        </CurrentRoleProvider>
      </DisplayLabelsProvider>
    </SessionProvider>
  </QueryProvider>
)
