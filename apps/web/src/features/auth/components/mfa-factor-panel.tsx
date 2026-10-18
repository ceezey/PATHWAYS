import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/ui/otp-input'
import type { FactorChoice } from '../hooks/use-mfa-flow'

export const MfaFactorPanel = ({
  current,
  privateEnrollment,
  choices,
  verifiedFactors,
  factorId,
  setFactorId,
  code,
  setCode,
  busy,
  codeFormVisible,
  verify,
}: {
  current: { factors: FactorChoice[] }
  privateEnrollment: { qr: string; secret: string } | null
  choices: FactorChoice[]
  verifiedFactors: FactorChoice[]
  factorId: string
  setFactorId: (value: string) => void
  code: string
  setCode: (value: string) => void
  busy: boolean
  codeFormVisible: boolean
  verify: () => Promise<void>
}) => (
  <div className="space-y-4">
    {privateEnrollment ? (
      <>
        <p>
          Open your authenticator app and scan this private QR code. Do not screenshot, share, or
          paste it. It is shown only in this page's memory.
        </p>
        {/* Sensitive inline QR must never use a remote image proxy. */}
        <img
          alt="Private authenticator setup QR code"
          src={privateEnrollment.qr}
          width={240}
          height={240}
          className="mx-auto bg-white p-3"
        />
        <details className="space-y-2 rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Can&apos;t scan? Enter key manually
          </summary>
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">
              Choose &quot;Enter a setup key&quot; in your authenticator app, select time-based, and
              type this key. Keep it private like the QR code.
            </p>
            <code className="block select-all break-all rounded border bg-muted p-3 text-center font-mono text-sm tracking-wider">
              {privateEnrollment.secret.replace(/(.{4})(?=.)/g, '$1 ')}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(privateEnrollment.secret)
                  .then(() => toast.success('Setup key copied.'))
                  .catch(() => toast.error('Could not copy the setup key.'))
              }}
            >
              Copy key
            </Button>
          </div>
        </details>
      </>
    ) : current.factors.length === 0 ? (
      <>
        <p>
          Have your authenticator app ready. Clicking below creates one TOTP factor for this
          account. The code and verification stay between your browser and Supabase Auth.
        </p>
      </>
    ) : choices.length ? (
      <>
        <p>
          {verifiedFactors.length
            ? 'Use your existing authenticator. No new factor will be created.'
            : 'An unfinished setup already exists. If you scanned its QR code, verify it below. Otherwise stop and request a reviewed recovery; this page never replaces or deletes factors.'}
        </p>
        {choices.length > 1 && (
          <>
            <label className="block text-sm" htmlFor="mfa-factor">
              Authenticator factor
            </label>
            <select
              id="mfa-factor"
              className="w-full rounded border p-2"
              value={factorId}
              disabled={busy}
              onChange={(event) => {
                setFactorId(event.target.value)
                setCode('')
              }}
            >
              {choices.map((factor, index) => (
                <option key={factor.id} value={factor.id}>
                  Authenticator {index + 1} ({factor.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </>
        )}
      </>
    ) : (
      <p>
        An unsupported factor exists. Stop and request a reviewed recovery; no factor will be
        changed here.
      </p>
    )}
    {codeFormVisible && (
      <form
        id="mfa-code-form"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void verify()
        }}
      >
        <label className="block text-sm" htmlFor="mfa-code">
          Six-digit authenticator code
        </label>
        <OtpInput
          id="mfa-code"
          length={6}
          label="Authenticator code"
          value={code}
          onChange={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
          disabled={busy}
          className="justify-center"
        />
      </form>
    )}
  </div>
)
