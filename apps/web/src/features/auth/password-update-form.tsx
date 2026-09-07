'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import Link from 'next/link'
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
import {
  type PasswordUpdate,
  classifyPasswordCompletionResult,
  passwordRecoveryCompletePath,
  passwordUpdateSchema,
} from './password-recovery'

export const PasswordUpdateForm = () => {
  const [completion, setCompletion] = useState<{ sessionClosed: boolean } | null>(null)
  const [safeError, setSafeError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [uncertainOutcome, setUncertainOutcome] = useState(false)
  const completionRef = useRef<HTMLDivElement>(null)
  const form = useForm<PasswordUpdate>({
    resolver: zodResolver(passwordUpdateSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  useEffect(() => {
    if (completion) completionRef.current?.focus()
  }, [completion])

  const onSubmit = async ({ password }: PasswordUpdate) => {
    setSafeError(null)
    setUncertainOutcome(false)
    try {
      const response = await fetch(passwordRecoveryCompletePath, {
        method: 'POST',
        body: JSON.stringify({ password }),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      })
      const result = await response.json().catch(() => null)
      const outcome = classifyPasswordCompletionResult(response.ok, result)
      if (outcome.kind === 'success') {
        setCompletion({ sessionClosed: outcome.sessionClosed })
        return
      }

      const isKnownUnchanged = outcome.kind === 'unchanged'
      setUncertainOutcome(!isKnownUnchanged)
      setSafeError(
        isKnownUnchanged
          ? 'Supabase did not change the password. If MFA is already enrolled, stop and use the existing MFA recovery process. Otherwise, request one new recovery message.'
          : 'The password-change result could not be confirmed. Do not submit it again. First try signing in with the new password. If that fails, request one new recovery message.',
      )
    } catch {
      setUncertainOutcome(true)
      setSafeError(
        'The password-change result could not be confirmed. Do not submit it again. First try signing in with the new password. If that fails, request one new recovery message.',
      )
    } finally {
      form.reset()
    }
  }

  if (completion) {
    return (
      <Card
        aria-live="polite"
        className="w-full max-w-[460px] rounded-lg border-white/70 bg-white/95 shadow-xl backdrop-blur"
        ref={completionRef}
        tabIndex={-1}
      >
        <CardHeader className="items-center space-y-3 text-center">
          <CheckCircle2 aria-hidden="true" className="h-12 w-12 text-success" />
          <CardTitle>Password changed</CardTitle>
          <CardDescription>
            {completion.sessionClosed
              ? 'Your recovery session was closed. Sign in with the new password, then continue the existing MFA check.'
              : 'The password changed, but Supabase did not confirm that this browser session closed. Close this browser window now. Then reopen the exact 127.0.0.1 address and sign in with the new password.'}
          </CardDescription>
        </CardHeader>
        {completion.sessionClosed ? (
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/staff/login">Return to sign in</Link>
            </Button>
          </CardContent>
        ) : null}
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-[460px] rounded-lg border-white/70 bg-white/95 shadow-xl backdrop-blur">
      <CardHeader className="items-center space-y-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <KeyRound aria-hidden="true" className="h-7 w-7" />
        </div>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Use a unique password with at least 12 characters, uppercase and lowercase letters, a
          number, and a symbol.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            {(['password', 'confirmPassword'] as const).map((name) => (
              <FormField
                control={form.control}
                key={name}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {name === 'password' ? 'New password' : 'Confirm password'}
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          autoComplete="new-password"
                          className="pr-11"
                          type={showPassword ? 'text' : 'password'}
                          {...field}
                        />
                      </FormControl>
                      <Button
                        aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                        className="absolute right-1 top-1 h-8 w-8"
                        onClick={() => setShowPassword((value) => !value)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <Eye aria-hidden="true" className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            {safeError ? (
              <div className="space-y-2">
                <p className="text-sm leading-6 text-destructive" role="alert">
                  {safeError}
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href={uncertainOutcome ? '/staff/login' : '/staff/forgot-password'}>
                    {uncertainOutcome ? 'Return to sign in' : 'Request a new recovery message'}
                  </Link>
                </Button>
              </div>
            ) : null}
            <Button
              className="w-full gap-2"
              disabled={form.formState.isSubmitting || uncertainOutcome}
              type="submit"
            >
              {form.formState.isSubmitting ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound aria-hidden="true" className="h-4 w-4" />
              )}
              {form.formState.isSubmitting ? 'Changing password...' : 'Change password'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
