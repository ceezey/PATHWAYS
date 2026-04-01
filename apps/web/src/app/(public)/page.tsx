import { CheckCircle2, DatabaseZap, Shield } from 'lucide-react'
import Link from 'next/link'

import { APP_DESCRIPTION, APP_NAME } from '@pathways/shared'

import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const highlights = [
  {
    title: 'Monorepo ready',
    description:
      'Next.js frontend, NestJS backend, and shared packages are scaffolded in one workspace.',
    icon: CheckCircle2,
  },
  {
    title: 'Supabase placeholders',
    description:
      'Database, auth, storage, and redirect hooks are prepared for human configuration.',
    icon: DatabaseZap,
  },
  {
    title: 'Safe-by-default tooling',
    description:
      'Biome, Vitest, Playwright, Docker, and CI configs are included for future development.',
    icon: Shield,
  },
]

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <section className="grid gap-8 rounded-[2rem] border border-border/70 bg-white/80 p-8 shadow-sm lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
              Development Ready Scaffold
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {APP_NAME}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">{APP_DESCRIPTION}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">Open Login Placeholder</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">View Dashboard Shell</Link>
            </Button>
          </div>
        </div>
        <Card className="bg-slate-950 text-slate-50">
          <CardHeader>
            <CardTitle>What this pass covers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
            <p>Sections 2 through 16 are scaffolded in code, docs, Docker, CI, and test tooling.</p>
            <p>
              Anything requiring actual Supabase credentials, redirect URLs, bucket creation, or
              live migrations is left as a clear placeholder for human setup.
            </p>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {highlights.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.title}>
              <CardHeader>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {item.description}
              </CardContent>
            </Card>
          )
        })}
      </section>
      <ModulePlaceholder
        title="Next steps for human setup"
        summary="Before the real product modules begin, wire the Supabase project details, create storage buckets, and run the first Prisma migration against your hosted Postgres database."
      />
    </main>
  )
}
