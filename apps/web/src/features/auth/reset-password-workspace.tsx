'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
import { resetDemoPassword, resetTokenState } from '@/lib/demo-state/accounts'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import { type ResetPasswordValues, resetPasswordSchema } from './account-access-validation'
import { StaffAuthFrame } from './staff-auth-frame'

type ResetState = 'valid' | 'expired' | 'used' | 'invalid'

const stateCopy: Record<Exclude<ResetState, 'valid'>, { title: string; description: string }> = {
  expired: {
    title: 'This recovery link has expired',
    description: 'Request a fresh recovery link before trying to set a new password.',
  },
  used: {
    title: 'This recovery link was already used',
    description: 'For account safety, a recovery link can be used only once.',
  },
  invalid: {
    title: 'This recovery link is not valid',
    description: 'The link is missing or cannot be recognized. Request a new recovery link.',
  },
}

const readResetState = (value: string | null): ResetState =>
  value === 'valid' || value === 'expired' || value === 'used' ? value : 'invalid'

export const ResetPasswordWorkspace = () => {
  const token = useSearchParams().get('token')
  const demo = useDemoState()
  const state = resetTokenState(token, demo)
  const [showPassword, setShowPassword] = useState(false)
  const [validated, setValidated] = useState(false)
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  if (state !== 'valid' && !validated) {
    const copy = stateCopy[state]
    return (
      <StaffAuthFrame title="Reset your password" description="Review the recovery-link state.">
        <div className="space-y-5">
          <div className="rounded-md border border-warning/30 bg-warning-subtle p-4 text-warning-foreground">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="font-semibold">{copy.title}</h2>
                <p className="text-sm leading-6">{copy.description}</p>
              </div>
            </div>
          </div>
          <Button asChild className="w-full">
            <Link href="/staff/recover">Request a new recovery link</Link>
          </Button>
        </div>
      </StaffAuthFrame>
    )
  }

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
                  Your password has been updated and the recovery link is no longer valid.
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
            onSubmit={form.handleSubmit(({ password, confirmPassword }) => {
              try {
                resetDemoPassword(token ?? '', password, confirmPassword)
                setValidated(true)
              } catch (error) {
                form.setError('password', {
                  message:
                    error instanceof Error ? error.message : 'Password could not be changed.',
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
