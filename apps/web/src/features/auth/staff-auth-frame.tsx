import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { BrandMark } from '@/components/pathways/brand-mark'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const StaffAuthFrame = ({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) => (
  <>
    <main
      className="flex min-h-dvh w-full items-center justify-center bg-[linear-gradient(135deg,#C8EAF9_0%,#F5FBFE_28%,#FFFFFF_58%,#DCEFFC_100%)] px-4 py-8 sm:py-10"
      id="main-content"
      tabIndex={-1}
    >
      <Card className="w-full max-w-[520px] rounded-md border-border bg-card shadow-dialog">
        <CardHeader className="flex flex-col items-center space-y-2 p-6 pb-4 text-center sm:p-8 sm:pb-5">
          <BrandMark className="h-11 w-11" priority />
          <p className="font-heading text-3xl font-normal leading-[2.125rem] text-foreground">
            PATHWAYS
          </p>
          <CardTitle as="h1" className="text-2xl leading-8 text-foreground">
            {title}
          </CardTitle>
          <CardDescription className="max-w-[46ch] text-sm leading-6">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6 pt-0 sm:p-8 sm:pt-0">{children}</CardContent>
      </Card>
    </main>
    <Link
      className="fixed left-4 top-4 inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-foreground underline-offset-4 hover:bg-white/70 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      href="/staff/login"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to sign in
    </Link>
  </>
)
