import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-lg">
        <CardHeader>
          <h1 className="text-xl font-semibold leading-none tracking-tight">Route not found</h1>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>We could not find the PATHWAYS page you requested.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/">Go to public dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to staff workspace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
