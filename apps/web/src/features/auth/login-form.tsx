'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Eye, EyeOff, Info, Loader2, LogIn, RotateCcw, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { useSession } from '@/hooks/use-session'
import { publicPrototypeAccounts } from '@/lib/auth/prototype-accounts'
import { createPrototypeSession } from '@/lib/auth/prototype-session'
import { webSetupState } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { getPrototypeRoleDisplayName } from '@/types/prototype-role'
import { type LoginSchema, loginSchema } from './login-validation'

export const LoginForm = () => {
  const router = useRouter()
  const { setRole } = usePrototypeRole()
  const { signInWithPrototype, refreshSession } = useSession()
  const [showPassword, setShowPassword] = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState<{
    maskedDestination: string
    expiresAt: string
    identifier: string
  } | null>(null)
  const [otp, setOtp] = useState('')
  const [otpStatus, setOtpStatus] = useState<'idle' | 'loading' | 'error' | 'expired' | 'locked'>(
    'idle',
  )
  const [otpMessage, setOtpMessage] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState(0)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: webSetupState.guiPrototypeModeEnabled ? 'program.manager' : '',
      password: '',
    },
  })

  const onSubmit = async (values: LoginSchema) => {
    if (webSetupState.guiPrototypeModeEnabled) {
      const response = await fetch('/api/prototype-mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const result = (await response.json()) as {
        maskedDestination?: string
        expiresAt?: string
        message?: string
      }

      if (!response.ok || !result.maskedDestination || !result.expiresAt) {
        form.setError('password', {
          type: 'validate',
          message:
            result.message ?? 'The username, email, or password does not match a demo account.',
        })
        return
      }

      setMfaChallenge({
        maskedDestination: result.maskedDestination,
        expiresAt: result.expiresAt,
        identifier: values.identifier,
      })
      setOtp('')
      setOtpStatus('idle')
      setOtpMessage('Use prototype OTP 123456 to continue.')
      setResendAvailableAt(Date.now() + 30_000)
      setClockNow(Date.now())
      toast.message('Prototype OTP verification required.', {
        description: `Use code 123456 for ${result.maskedDestination}.`,
      })
      return
    }

    if (webSetupState.authBypassEnabled) {
      await refreshSession()
      toast.success('Development auth bypass is enabled. Opening the dashboard shell.')
      router.push('/dashboard')
      return
    }

    const supabase = getBrowserSupabaseClient()

    if (!supabase) {
      toast.message('Supabase auth still needs manual setup.', {
        description: 'Add NEXT_PUBLIC_SUPABASE_URL and a Supabase publishable key first.',
      })
      return
    }

    const emailResult = loginSchema
      .extend({
        identifier: loginSchema.shape.identifier.email('Enter a valid staff email.'),
      })
      .safeParse(values)

    if (!emailResult.success) {
      form.setError('identifier', {
        type: 'validate',
        message: 'Enter a valid staff email for Supabase sign-in.',
      })
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: values.identifier,
      password: values.password,
    })

    if (error) {
      toast.error('Could not sign in.', {
        description: error.message,
      })
      return
    }

    await refreshSession()
    toast.success('Session established.')
    router.push('/dashboard')
  }

  const verifyOtp = async () => {
    if (!mfaChallenge || otp.length !== 6 || otpStatus === 'loading') {
      return
    }

    if (new Date(mfaChallenge.expiresAt).getTime() <= Date.now()) {
      setOtpStatus('expired')
      setOtpMessage('The OTP code has expired. Resend a new code to continue.')
      return
    }

    setOtpStatus('loading')
    const response = await fetch('/api/prototype-mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp }),
    })
    const result = (await response.json()) as {
      account?: Parameters<typeof createPrototypeSession>[0]
      message?: string
    }

    if (!response.ok || !result.account) {
      setOtp('')
      setOtpStatus(
        response.status === 410 ? 'expired' : response.status === 429 ? 'locked' : 'error',
      )
      setOtpMessage(result.message ?? 'The OTP code could not be verified.')
      return
    }

    // TODO(AUTH): Replace the GUI prototype OTP challenge with the finalized Supabase Auth MFA flow.
    await signInWithPrototype(createPrototypeSession(result.account))
    setRole(result.account.role)
    toast.success('Prototype session started after OTP verification.', {
      description: `${getPrototypeRoleDisplayName(result.account.role)} dashboard preview is ready.`,
    })
    window.location.replace('/dashboard')
  }

  const resendOtp = async () => {
    const values = form.getValues()
    setOtp('')
    setOtpStatus('loading')
    await onSubmit(values)
  }

  useEffect(() => {
    if (!mfaChallenge) {
      return
    }

    setClockNow(Date.now())
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)

    return () => window.clearInterval(timer)
  }, [mfaChallenge])

  if (mfaChallenge) {
    const secondsUntilResend = Math.max(0, Math.ceil((resendAvailableAt - clockNow) / 1000))
    const expired = new Date(mfaChallenge.expiresAt).getTime() <= clockNow

    return (
      <Card className="w-full max-w-[430px] rounded-lg border-white/70 bg-white/95 shadow-xl backdrop-blur">
        <CardHeader className="items-center space-y-3 pb-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <UserRound className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-normal text-foreground">
              OTP verification
            </CardTitle>
            <CardDescription className="mt-2 text-sm">
              Enter the six-digit prototype code for {mfaChallenge.maskedDestination}.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
            {/* TODO(AUTH): Replace the prototype OTP challenge with the finalized organization-approved MFA provider. */}
            {/* TODO(SECURITY): Enforce rate limits, lockout, audit logging, and secure challenge storage server-side. */}
            {expired ? 'This OTP challenge has expired.' : otpMessage}
          </div>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              void verifyOtp()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="staff-otp">Six-digit OTP code</Label>
              <Input
                id="staff-otp"
                autoComplete="one-time-code"
                autoFocus
                className="text-center text-2xl tracking-[0.45em]"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
              />
              <p className="text-xs text-muted-foreground">
                Password verification alone does not create a staff session.
              </p>
            </div>
            <Button
              className="w-full gap-2"
              disabled={otp.length !== 6 || otpStatus === 'loading' || otpStatus === 'locked'}
              type="submit"
            >
              {otpStatus === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              Verify Code
            </Button>
          </form>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              className="gap-2"
              type="button"
              variant="outline"
              onClick={() => {
                setMfaChallenge(null)
                setOtp('')
                setOtpStatus('idle')
              }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to login
            </Button>
            <Button
              className="gap-2"
              disabled={secondsUntilResend > 0 || otpStatus === 'loading'}
              type="button"
              variant="outline"
              onClick={() => void resendOtp()}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {secondsUntilResend > 0 ? `Refresh in ${secondsUntilResend}s` : 'Refresh code'}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-[430px] rounded-lg border-white/70 bg-white/95 shadow-xl backdrop-blur">
      <CardHeader className="items-center space-y-3 pb-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <UserRound className="h-8 w-8" aria-hidden="true" />
        </div>
        <div>
          <CardTitle className="text-3xl font-bold tracking-normal text-foreground">
            PATHWAYS
          </CardTitle>
          <CardDescription className="mt-2 text-sm">Project Information Management</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <h1 className="text-lg font-semibold text-foreground">Sign in to PATHWAYS</h1>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username or email</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="username"
                      className="border-0 border-b border-border bg-transparent px-0 shadow-none"
                      placeholder={
                        webSetupState.guiPrototypeModeEnabled
                          ? 'program.manager'
                          : 'name@organization.org'
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        autoComplete="current-password"
                        className="border-0 border-b border-border bg-transparent px-0 pr-11 shadow-none"
                        placeholder="Enter your password"
                        type={showPassword ? 'text' : 'password'}
                        {...field}
                      />
                    </FormControl>
                    <Button
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1 h-8 w-8"
                      onClick={() => setShowPassword((value) => !value)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    className="w-fit px-0 underline-offset-4 hover:underline"
                    type="button"
                    variant="ghost"
                  >
                    Forgot Password?
                  </Button>
                </DialogTrigger>
                <DialogShell
                  title="Password recovery"
                  description={
                    webSetupState.guiPrototypeModeEnabled
                      ? 'Prototype mode does not send recovery emails.'
                      : 'Use the finalized Supabase recovery flow once production auth is configured.'
                  }
                >
                  <p className="text-sm leading-6 text-muted-foreground">
                    {webSetupState.guiPrototypeModeEnabled
                      ? 'Choose one of the safe demo accounts and use the listed prototype password. No real account is changed.'
                      : 'Ask the System Administrator to confirm the Supabase password recovery settings for your environment.'}
                  </p>
                </DialogShell>
              </Dialog>
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                {webSetupState.guiPrototypeModeEnabled
                  ? 'Prototype authentication only'
                  : 'Supabase authentication path'}
              </p>
            </div>
            <Button className="w-full gap-2" disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              {form.formState.isSubmitting ? 'Logging in...' : 'Log In'}
            </Button>
          </form>
        </Form>
        {webSetupState.guiPrototypeModeEnabled ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button className="mt-4 w-full" type="button" variant="outline">
                Demo Accounts
              </Button>
            </DialogTrigger>
            <DialogShell
              title="Demo accounts"
              description="Use these safe prototype accounts only when GUI prototype mode is enabled."
            >
              <div className="space-y-3">
                {publicPrototypeAccounts.map((account) => (
                  <button
                    key={account.id}
                    className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => {
                      form.setValue('identifier', account.username)
                      form.setValue('password', 'PathwaysDemo!2026')
                      setRole(account.role)
                    }}
                    type="button"
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {getPrototypeRoleDisplayName(account.role)}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Username: {account.username} | Password: PathwaysDemo!2026
                    </span>
                  </button>
                ))}
              </div>
            </DialogShell>
          </Dialog>
        ) : null}
      </CardContent>
    </Card>
  )
}
