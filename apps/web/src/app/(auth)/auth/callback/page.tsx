import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthCallbackPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Authentication method unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Redirect-based sign-in is not enabled for this staff portal. Use the configured staff
            sign-in method instead.
          </p>
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            href="/staff/login"
          >
            Return to login
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
