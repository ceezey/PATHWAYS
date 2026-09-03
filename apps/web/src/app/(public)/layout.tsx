import { SiteHeader } from '@/components/layout/site-header'
import { SkipLink } from '@/components/layout/skip-link'

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <SkipLink />
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
