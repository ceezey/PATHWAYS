'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, KeyRound, Loader2, Mail } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
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
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  type PasswordRecoveryRequest,
  isApprovedPasswordRecoveryOrigin,
  passwordRecoveryAcknowledgement,
  passwordRecoveryRequestSchema,
  passwordRecoveryRequestUrl,
  requestPasswordRecoveryEmail,
} from './password-recovery'

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
    <Card className="w-full max-w-[460px] rounded-lg border-white/70 bg-white/95 shadow-xl backdrop-blur">
      <CardHeader className="items-center space-y-3 pb-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <KeyRound aria-hidden="true" className="h-7 w-7" />
        </div>
        <div>
          <CardTitle className="text-2xl font-bold tracking-normal">Reset your password</CardTitle>
          <CardDescription className="mt-2">
            Request a private recovery message for the existing developer account.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {acknowledgement ? (
          <output className="block space-y-4">
            <p className="text-sm leading-6 text-foreground">{acknowledgement}</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Keep this server running. Open the message in this same browser profile and return to
              the exact 127.0.0.1 address. Do not copy the recovery link into chat or another
              browser.
            </p>
          </output>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              Enter only the email already attached to the approved PATHWAYS-dev account. This form
              never creates an account and never asks for a database password.
            </p>
            <Form {...form}>
              <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <div className="relative">
                        <Mail
                          aria-hidden="true"
                          className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                        />
                        <FormControl>
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
                <Button
                  className="w-full gap-2"
                  disabled={form.formState.isSubmitting}
                  type="submit"
                >
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
        <Button asChild className="w-full gap-2" variant="outline">
          <Link href="/staff/login">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to sign in
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
