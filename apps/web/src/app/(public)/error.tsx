'use client'

import { RefreshCw } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function PublicError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center bg-slate-50 px-4 py-12 sm:px-6">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          Public dashboard
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Public information could not be loaded
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
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
