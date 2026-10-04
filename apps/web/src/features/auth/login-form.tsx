'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, LogIn, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

        {checkingSession ? (
          <output className="block text-sm" aria-live="polite">
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
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          autoCapitalize="none"
                          autoComplete="username"
                          className="border-0 border-b border-border bg-transparent px-0 shadow-none"
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
                      <FormControl>
                        <div className="relative">
                          <Input
                            aria-label="Password"
                            autoComplete="current-password"
                            className="border-0 border-b border-border bg-transparent px-0 pr-11 shadow-none"
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
                          <Button
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-1 top-1 h-8 w-8"
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
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  asChild
                  className="w-fit px-0 underline-offset-4 hover:underline"
                  variant="ghost"
                >
                  <Link href="/staff/forgot-password">Forgot Password?</Link>
                </Button>
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
      </CardContent>
    </Card>
  )
}
