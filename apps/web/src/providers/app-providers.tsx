'use client'

import { Toaster } from '@/components/ui/sonner'
import { QueryProvider } from '@/providers/query-provider'
import { SessionProvider } from '@/providers/session-provider'

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryProvider>
    <SessionProvider>
      {children}
      <Toaster richColors position="top-right" />
    </SessionProvider>
  </QueryProvider>
)
