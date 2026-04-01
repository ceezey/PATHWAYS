import type { Metadata } from 'next'

import { APP_DESCRIPTION, APP_NAME } from '@pathways/shared'

import { initializeWebSentry } from '@/lib/sentry'
import { AppProviders } from '@/providers/app-providers'

import './globals.css'

initializeWebSentry()

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
