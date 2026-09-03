import { ArrowLeft, Home } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function PublicProjectNotFound() {
  return (
    <div className="flex min-h-[70vh] items-center bg-slate-50 px-4 py-12 sm:px-6">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          Public project
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Project page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This project may not have an approved public page. Choose another public project or return
          home.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/public/projects">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Browse public projects
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              Public dashboard home
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
