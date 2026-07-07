import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { publicNavigation } from '@/constants/navigation'

export const SiteHeader = () => (
  <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
    <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
      <Link className="space-y-1" href="/">
        <p className="text-xs font-semibold uppercase text-teal-700">HDO Public Dashboard</p>
        <p className="text-lg font-semibold text-slate-950">PATHWAYS</p>
      </Link>
      <nav className="hidden items-center gap-6 md:flex">
        {publicNavigation.map((item) => (
          <Link
            key={item.href}
            className="text-sm text-slate-600 transition-colors hover:text-slate-950"
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
