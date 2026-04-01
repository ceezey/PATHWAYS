import { SiteHeader } from '@/components/layout/site-header'

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      {children}
    </div>
  )
}
