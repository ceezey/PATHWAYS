'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
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
import { type ResetPasswordValues, resetPasswordSchema } from './account-access-validation'
import { classifyPasswordCompletionResult, passwordRecoveryCompletePath } from './password-recovery'
import { StaffAuthFrame } from './staff-auth-frame'

export const ResetPasswordWorkspace = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [validated, setValidated] = useState(false)
  const [sessionClosed, setSessionClosed] = useState(false)
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  return (
    <StaffAuthFrame
      title="Create a new password"
      description="Choose a strong password and confirm it before continuing."
    >
      {validated ? (
        <div className="space-y-5">
          <output className="block rounded-md border border-primary/25 bg-primary-subtle p-4 text-light-blue-foreground">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="font-semibold">Password updated</h2>
                <p className="text-sm leading-6">
                  {sessionClosed
                    ? 'Your password has been updated and the recovery session was closed.'
                    : 'Your password changed, but session closure was not confirmed. Close this browser window before signing in again.'}
                </p>
              </div>
            </div>
          </output>
          <Button asChild className="w-full">
            <Link href="/staff/login">Return to sign in</Link>
          </Button>
        </div>
      ) : (
        <Form {...form}>
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async ({ password }) => {
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
                  setSessionClosed(outcome.sessionClosed)
                  setValidated(true)
                  return
                }
                form.setError('password', {
                  message:
                    outcome.kind === 'unchanged'
                      ? 'The password was not changed. Request a new recovery link if needed.'
                      : 'The result could not be confirmed. Do not submit again; try signing in before requesting another recovery link.',
                })
              } catch {
                form.setError('password', {
                  message:
                    'The result could not be confirmed. Do not submit again; try signing in before requesting another recovery link.',
                })
              }
            })}
          >
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
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  <FormDescription>
                    Use 12–64 characters with uppercase, lowercase, number, and symbol characters.
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
            <Button className="w-full" type="submit">
              Update password
            </Button>
          </form>
        </Form>
      )}
    </StaffAuthFrame>
  )
}
