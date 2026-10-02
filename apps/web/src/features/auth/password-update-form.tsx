'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
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
import {
  type PasswordUpdate,
  classifyPasswordCompletionResult,
  passwordRecoveryCompletePath,
  passwordUpdateSchema,
} from './password-recovery'
import { StaffAuthFrame } from './staff-auth-frame'

export const PasswordUpdateForm = () => {
  const [completion, setCompletion] = useState<{ sessionClosed: boolean } | null>(null)
  const [safeError, setSafeError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [uncertainOutcome, setUncertainOutcome] = useState(false)
  const completionRef = useRef<HTMLOutputElement>(null)
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
    }
  }

  if (completion) {
    return (
      <StaffAuthFrame
        title="Password updated"
        description="Your password change has been processed."
      >
        <output
          aria-live="polite"
          className="block rounded-md border border-primary/25 bg-primary-subtle p-4 text-light-blue-foreground"
          ref={completionRef}
          tabIndex={-1}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm leading-6">
              {completion.sessionClosed
                ? 'Your recovery session was closed. Sign in with the new password, then continue the existing MFA check.'
                : 'The password changed, but Supabase did not confirm that this browser session closed. Close this browser window now. Then reopen this staff portal and sign in with the new password.'}
            </p>
          </div>
        </output>
        {completion.sessionClosed ? (
          <Button asChild className="w-full">
            <Link href="/staff/login">Return to sign in</Link>
          </Button>
        ) : null}
      </StaffAuthFrame>
    )
  }

  return (
    <StaffAuthFrame
      title="Create a new password"
      description="Choose a strong password and confirm it before continuing."
    >
      <Form {...form}>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>New password</FormLabel>
                <div className="relative">
                  <FormControl aria-required="true">
                    <Input
                      autoComplete="new-password"
                      className="pr-12"
                      type={showPassword ? 'text' : 'password'}
                      {...field}
                    />
                  </FormControl>
                  <Button
                    aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                    className="absolute right-0 top-0"
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
                <FormDescription>
                  Use at least 12 characters with uppercase, lowercase, number, and symbol
                  characters.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Confirm new password</FormLabel>
                <FormControl aria-required="true">
                  <Input
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {safeError ? (
            <div
              className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4"
              role="alert"
            >
              <p className="text-sm leading-6 text-destructive">{safeError}</p>
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
    </StaffAuthFrame>
  )
}
