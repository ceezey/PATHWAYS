'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Mail } from 'lucide-react'
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
import { recoveryResponse, requestDemoReset } from '@/lib/demo-state/accounts'
import { webSetupState } from '@/lib/env'
import { type RecoveryRequestValues, recoveryRequestSchema } from './account-access-validation'
import { StaffAuthFrame } from './staff-auth-frame'

const genericResponse = recoveryResponse

export const AccountRecoveryWorkspace = () => {
  const [submitted, setSubmitted] = useState(false)
  const form = useForm<RecoveryRequestValues>({
    resolver: zodResolver(recoveryRequestSchema),
    defaultValues: { email: '' },
  })

  return (
    <StaffAuthFrame
      title="Recover your account"
      description="Enter the email address registered to your active PATHWAYS staff account."
    >
      {submitted ? (
        <section className="space-y-5" aria-labelledby="recovery-requested-title">
          <output className="block rounded-md border border-success/30 bg-success-subtle p-4 text-success">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <h2 id="recovery-requested-title" className="font-semibold">
                  Request received
                </h2>
                <p className="text-sm leading-6">{genericResponse}</p>
              </div>
            </div>
          </output>
          <p className="text-sm leading-6 text-muted-foreground">
            Demo data: no email is sent. Local reset links are available in the separate fictional
            inbox for review.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="sm:flex-1" variant="outline">
              <Link href="/staff/login">Return to sign in</Link>
            </Button>
            {webSetupState.guiPrototypeModeEnabled ? (
              <Button asChild className="sm:flex-1">
                <Link href="/review/demo-controls">Open fictional demo inbox</Link>
              </Button>
            ) : null}
          </div>
          <Button
            className="w-full"
            onClick={() => {
              setSubmitted(false)
              form.reset()
              window.requestAnimationFrame(() => form.setFocus('email'))
            }}
            type="button"
            variant="ghost"
          >
            Use another email address
          </Button>
        </section>
      ) : (
        <Form {...form}>
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(({ email }) => {
              requestDemoReset(email)
              setSubmitted(true)
            })}
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Registered email address</FormLabel>
                  <FormControl aria-required="true">
                    <Input
                      autoComplete="email"
                      inputMode="email"
                      placeholder="name@organization.org"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    The response is intentionally the same for every valid address.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="rounded-md border border-primary/20 bg-primary-subtle p-3 text-sm leading-6 text-light-blue-foreground">
              <span className="inline-flex items-center gap-2 font-semibold">
                <Mail className="h-4 w-4" aria-hidden="true" />
                Demo data
              </span>
              <p className="mt-1">
                Recovery changes only browser-local fictional credentials. No email is sent.
              </p>
            </div>
            <Button className="w-full" type="submit">
              Continue
            </Button>
          </form>
        </Form>
      )}
    </StaffAuthFrame>
  )
}
