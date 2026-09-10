import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthCallbackPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle as="h1">Sign-in could not be completed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>Return to the staff sign-in page and try again.</p>
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
