import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthCallbackPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Auth callback placeholder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            This route is intentionally reserved for Supabase Auth redirect handling once you
            configure your Site URL and redirect URLs in the Supabase dashboard.
          </p>
          <p>
            After that human setup is complete, you can replace this page with the real session
            exchange and redirect flow.
          </p>
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            href="/login"
          >
            Return to login
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
