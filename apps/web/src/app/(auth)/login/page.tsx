import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/features/auth/login-form'
import { webSetupState } from '@/lib/env'

export default function LoginPage() {
  return (
    <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Authentication"
          title="Sign in to PATHWAYS"
          description="Email/password auth is scaffolded for internal staff through Supabase Auth, with redirect handling reserved at /auth/callback."
        />
        <Card>
          <CardHeader>
            <CardTitle>Current setup state</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>Supabase client configured: {webSetupState.supabaseConfigured ? 'Yes' : 'No'}</p>
            <p>Development auth bypass enabled: {webSetupState.authBypassEnabled ? 'Yes' : 'No'}</p>
            <p>Reserved redirect target: /auth/callback</p>
          </CardContent>
        </Card>
      </div>
      <LoginForm />
    </div>
  )
}
