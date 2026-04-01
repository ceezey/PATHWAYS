import Link from 'next/link'

import { APP_NAME } from '@pathways/shared'

import { Button } from '@/components/ui/button'
import { publicNavigation } from '@/constants/navigation'

export const SiteHeader = () => (
  <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
    <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
      <Link className="space-y-1" href="/">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">
          Monitoring Scaffold
        </p>
        <p className="text-lg font-semibold text-foreground">{APP_NAME}</p>
      </Link>
      <nav className="hidden items-center gap-6 md:flex">
        {publicNavigation.map((item) => (
          <Link
            key={item.href}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Button asChild size="sm">
        <Link href="/login">Staff Login</Link>
      </Button>
    </div>
  </header>
)
