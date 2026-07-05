import { ShieldCheck, Workflow } from 'lucide-react'

import { StatusBadge } from '@/components/pathways/status-badge'
import { LoginForm } from '@/features/auth/login-form'
import { webSetupState } from '@/lib/env'

export default function LoginPage() {
  return (
    <div className="grid w-full items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-8">
        <div className="space-y-4">
          <StatusBadge tone={webSetupState.guiPrototypeModeEnabled ? 'info' : 'neutral'}>
            {webSetupState.guiPrototypeModeEnabled ? 'GUI prototype mode' : 'Supabase auth mode'}
          </StatusBadge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Sign in to PATHWAYS
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Project Information Management for program teams, project teams, monitoring staff, and
              system administrators.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Workflow className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Role-specific workspace</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The selected prototype role controls the visible dashboard preview.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Authentication boundary</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Prototype login is display-only and does not grant production authorization.
            </p>
          </div>
        </div>
        <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div>
            <dt className="font-medium text-foreground">Supabase configured</dt>
            <dd>{webSetupState.supabaseConfigured ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Prototype mode</dt>
            <dd>{webSetupState.guiPrototypeModeEnabled ? 'Enabled' : 'Disabled'}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Callback route</dt>
            <dd>/auth/callback</dd>
          </div>
        </dl>
      </div>
      <LoginForm />
    </div>
  )
}
