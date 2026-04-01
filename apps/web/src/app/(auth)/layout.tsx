import { SiteHeader } from '@/components/layout/site-header'

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-6xl items-center px-6 py-12">
        {children}
      </main>
    </div>
  )
}
