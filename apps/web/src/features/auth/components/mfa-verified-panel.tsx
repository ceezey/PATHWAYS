import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { useCurrentRole } from '@/hooks/use-current-role'
import type { MfaHandoff } from '../hooks/use-mfa-handoff'

type CurrentRole = ReturnType<typeof useCurrentRole>

export const MfaVerifiedPanel = ({
  applicationAccessEnabled,
  access,
  handoff,
  accessRefreshing,
  accessError,
}: {
  applicationAccessEnabled: boolean
  access: CurrentRole['access']
  handoff: MfaHandoff
  accessRefreshing: boolean
  accessError: CurrentRole['accessError']
}) => (
  <div className="space-y-4">
    <output>MFA session verified by the API (aal2).</output>
    {!applicationAccessEnabled ? (
      <p>
        Application access is currently unavailable. Ask an administrator to review your active
        profile and workspace assignment.
      </p>
    ) : access === 'ready' ? (
      <div className="space-y-3">
        <p>Your identity and application access are verified.</p>
        {handoff === 'stalled' ? (
          <div className="space-y-3">
            <p role="alert">
              Your sign-in check completed, but the workspace could not open. Retry opening it
              below. Access will be checked again.
            </p>
            {!accessRefreshing && (
              <Button asChild variant="outline">
                <a href="/workspace">Retry opening workspace</a>
              </Button>
            )}
          </div>
        ) : (
          <output className="flex items-center gap-2" aria-live="polite" aria-busy="true">
            <LoaderCircle
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Opening your dashboard...
          </output>
        )}
      </div>
    ) : (
      <div className="space-y-3" aria-busy={access === 'loading'}>
        {access === 'loading' ? (
          <output>Finding your authorized workspace...</output>
        ) : access === 'no_workspace' ? (
          <output>
            No authorized workspace is available. Ask an administrator to review your access, or
            sign out. Reload this page after access is updated.
          </output>
        ) : accessError ? (
          <p className="text-sm text-destructive" role="alert">
            {accessError}
          </p>
        ) : (
          <output>
            Workspace access is not available. Reload this page or ask the development administrator
            for help.
          </output>
        )}
      </div>
    )}
  </div>
)
