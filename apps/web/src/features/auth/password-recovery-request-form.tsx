'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'
import { useState } from 'react'
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
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  type PasswordRecoveryRequest,
  isApprovedPasswordRecoveryOrigin,
  passwordRecoveryAcknowledgement,
  passwordRecoveryRequestSchema,
  passwordRecoveryRequestUrl,
  requestPasswordRecoveryEmail,
} from './password-recovery'
import { StaffAuthFrame } from './staff-auth-frame'

export const PasswordRecoveryRequestForm = () => {
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null)
  const form = useForm<PasswordRecoveryRequest>({
    resolver: zodResolver(passwordRecoveryRequestSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async ({ email }: PasswordRecoveryRequest) => {
    const currentOrigin = window.location.origin
    if (!isApprovedPasswordRecoveryOrigin(currentOrigin)) {
      window.location.replace(passwordRecoveryRequestUrl)
      return
    }

    const supabase = getBrowserSupabaseClient()
    if (supabase) {
      await requestPasswordRecoveryEmail(supabase.auth, email, currentOrigin)
    }

    form.reset()
    setAcknowledgement(passwordRecoveryAcknowledgement)
  }

  return (
    <StaffAuthFrame
      title="Reset your password"
      description="Request a private recovery message for your existing account."
    >
      {acknowledgement ? (
        <output className="block rounded-md border border-primary/25 bg-primary-subtle p-4 text-light-blue-foreground">
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-semibold leading-6">{acknowledgement}</p>
              <p className="text-sm leading-6">
                Open the message in this same browser profile and return to this staff portal. Do
                not copy the recovery link into chat or another browser.
              </p>
            </div>
          </div>
        </output>
      ) : (
        <>
          <p className="text-sm leading-6 text-muted-foreground">
            Enter only the email already attached to your approved PATHWAYS account. This form never
            creates an account and never asks for a database password.
          </p>
          <Form {...form}>
            <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Email</FormLabel>
                    <div className="relative">
                      <Mail
                        aria-hidden="true"
                        className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                      />
                      <FormControl aria-required="true">
                        <Input
                          autoComplete="email"
                          className="pl-9"
                          placeholder="name@organization.org"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button className="w-full gap-2" disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail aria-hidden="true" className="h-4 w-4" />
                )}
                {form.formState.isSubmitting ? 'Requesting...' : 'Send recovery message'}
              </Button>
            </form>
          </Form>
        </>
      )}
    </StaffAuthFrame>
  )
}
