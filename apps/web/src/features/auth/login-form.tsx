'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, Lock, LogIn, Mail } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useSession } from '@/hooks/use-session'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { type LoginSchema, loginSchema } from './login-validation'
import { formatLockRemaining, requestSignIn } from './signin-request'
import { StaffAuthFrame } from './staff-auth-frame'

const invalidCredentialsMessage = 'Could not sign in. Check your credentials and try again.'
const authenticationUnavailableMessage =
  'Authentication is temporarily unavailable. No application access was granted.'

export const LoginForm = () => {
  const router = useRouter()
  const { configured, status } = useSession()
  const inFlight = useRef(false)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
    },
  })
  const identifier = form.watch('identifier')
  const [lock, setLock] = useState<{ until: number; email: string } | null>(null)
  const [remaining, setRemaining] = useState(0)
  const locked = remaining > 0

  useEffect(() => {
    if (status === 'authenticated') router.replace('/auth/mfa')
  }, [router, status])

  // Lockout is per identifier, so editing the email releases the local lock.
  useEffect(() => {
    if (lock && identifier.trim().toLowerCase() !== lock.email) setLock(null)
  }, [identifier, lock])

  // Recompute from the absolute timestamp so the countdown survives a sleeping tab.
  useEffect(() => {
    if (!lock) {
      setRemaining(0)
      return
    }
    const tick = () => {
      const seconds = Math.ceil((lock.until - Date.now()) / 1000)
      if (seconds > 0) {
        setRemaining(seconds)
        return
      }
      setRemaining(0)
      setLock(null)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [lock])

  const onSubmit = async (values: LoginSchema) => {
    if (inFlight.current || locked) return
    const supabase = getBrowserSupabaseClient()

    if (!configured || !supabase) {
      setError('Supabase authentication is not configured. No application access was granted.')
      return
    }

    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const outcome = await requestSignIn(values.identifier, values.password)
      form.resetField('password')
      if (outcome.kind === 'locked') {
        setLock({
          until: Date.now() + outcome.retryAfterSeconds * 1000,
          email: values.identifier.trim().toLowerCase(),
        })
        return
      }
      const { error: authError } =
        outcome.kind === 'session'
          ? await supabase.auth.setSession({
              access_token: outcome.accessToken,
              refresh_token: outcome.refreshToken,
            })
          : { error: true }
      if (authError) {
        setError(invalidCredentialsMessage)
        return
      }

      // A fresh provider response establishes identity at AAL1 only. The global
      // session provider performs online validation independently, and this route
      // can enter only the existing TOTP/API checks—not a business surface.
      router.replace('/auth/mfa')
    } catch {
      form.resetField('password')
      setError(authenticationUnavailableMessage)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const checkingSession = status === 'loading' || status === 'authenticated'

  return (
    <StaffAuthFrame title="Sign in" backLink={false}>
      {checkingSession ? (
        <output className="block text-sm text-muted-foreground" aria-live="polite">
          Checking your existing session...
        </output>
      ) : !configured ? (
        <p className="text-sm text-destructive" role="alert">
          Supabase authentication is not configured. No application access was granted.
        </p>
      ) : (
        <>
          {locked && (
            <p id="staff-login-error" className="text-sm text-destructive" role="alert">
              <span className="sr-only">Sign-in is locked for 15 minutes. </span>
              <span aria-hidden="true">
                Too many failed sign-in attempts. Try again in {formatLockRemaining(remaining)}.
              </span>
            </p>
          )}
          {error && (
            <p
              id="staff-login-error"
              className="text-sm text-destructive"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          )}
          <Form {...form}>
            <form className="space-y-5" aria-busy={busy} onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Email</FormLabel>
                    <div className="relative">
                      <Mail
                        aria-hidden="true"
                        className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                      />
                      <FormControl aria-required="true">
                        <Input
                          autoCapitalize="none"
                          autoComplete="username"
                          className="pl-9"
                          disabled={busy}
                          inputMode="email"
                          maxLength={254}
                          placeholder="name@organization.org"
                          spellCheck={false}
                          type="email"
                          {...field}
                          onChange={(event) => {
                            field.onChange(event)
                            setError('')
                          }}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Password</FormLabel>
                    <div className="relative">
                      <Lock
                        aria-hidden="true"
                        className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                      />
                      <FormControl aria-required="true">
                        <Input
                          aria-label="Password"
                          autoComplete="current-password"
                          className="pl-9 pr-11"
                          disabled={busy || locked}
                          maxLength={1024}
                          placeholder="Enter your password"
                          type={showPassword ? 'text' : 'password'}
                          {...field}
                          onChange={(event) => {
                            field.onChange(event)
                            setError('')
                          }}
                        />
                      </FormControl>
                      <Button
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 top-1 h-9 w-9"
                        disabled={busy}
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
              <div className="flex justify-start">
                <Link
                  className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  href="/staff/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
              <Button className="w-full gap-2" disabled={busy || locked} type="submit">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                )}
                {busy ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </Form>
        </>
      )}
    </StaffAuthFrame>
  )
}
