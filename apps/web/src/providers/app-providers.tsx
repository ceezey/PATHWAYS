'use client'

import { Toaster } from '@/components/ui/sonner'
import { PrototypeLabelsProvider } from '@/providers/prototype-labels-provider'
import { PrototypeRoleProvider } from '@/providers/prototype-role-provider'
import { QueryProvider } from '@/providers/query-provider'
import { SessionProvider } from '@/providers/session-provider'

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryProvider>
    <SessionProvider>
      <PrototypeLabelsProvider>
        <PrototypeRoleProvider>
          {children}
          <Toaster richColors position="top-right" />
        </PrototypeRoleProvider>
      </PrototypeLabelsProvider>
    </SessionProvider>
  </QueryProvider>
)
