'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/hooks/use-session'
import { useState } from 'react'

export function AccessRecovery() {
  const { signOut } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leave = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signOut()
      window.location.assign('/staff/login')
    } catch {
      setError(
        'Sign-out could not be confirmed. Close this private browser window before continuing.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Workspace verification unavailable</CardTitle>
        <CardDescription>
          Current access could not be confirmed. This may be a temporary service problem or a change
          to your workspace access; it is not a request for another authenticator code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          No protected data is shown. Retrying will check your current session and access again.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <a href="/workspace">Retry opening workspace</a>
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void leave()}>
            Sign out securely
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
