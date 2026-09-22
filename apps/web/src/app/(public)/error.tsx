'use client'

import { RefreshCw } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function PublicError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center bg-surface-subtle px-4 py-12 sm:px-6">
      <section className="mx-auto w-full max-w-xl rounded-lg border border-border bg-card p-6 text-center sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Public dashboard
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Public information could not be loaded
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Try again, or return to the public dashboard home.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button className="gap-2" onClick={reset} type="button">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Public dashboard home</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
