'use client'

import { Toaster } from '@/components/ui/sonner'
import { CurrentRoleProvider } from '@/providers/current-role-provider'
import { DisplayLabelsProvider } from '@/providers/display-labels-provider'
import { QueryProvider } from '@/providers/query-provider'
import { SessionProvider } from '@/providers/session-provider'

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryProvider>
    <SessionProvider>
      <DisplayLabelsProvider>
        <CurrentRoleProvider>
          {children}
          <Toaster richColors position="top-right" />
        </CurrentRoleProvider>
      </DisplayLabelsProvider>
    </SessionProvider>
  </QueryProvider>
)
