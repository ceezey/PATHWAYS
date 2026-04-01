'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { webSetupState } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'

const loginSchema = z.object({
  email: z.string().email('Enter a valid staff email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

type LoginSchema = z.infer<typeof loginSchema>

export const LoginForm = () => {
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'admin@example.com',
      password: 'password123',
    },
  })

  const onSubmit = async (values: LoginSchema) => {
    if (webSetupState.authBypassEnabled) {
      toast.success('Development auth bypass is enabled. Open /dashboard to continue.')
      return
    }

    const supabase = getBrowserSupabaseClient()

    if (!supabase) {
      toast.message('Supabase auth still needs manual setup.', {
        description: 'Add NEXT_PUBLIC_SUPABASE_URL and a Supabase publishable key first.',
      })
      return
    }

    const { error } = await supabase.auth.signInWithPassword(values)

    if (error) {
      toast.error('Login placeholder could not sign in.', {
        description: error.message,
      })
      return
    }

    toast.success('Session established. You can now open the dashboard shell.')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff login</CardTitle>
        <CardDescription>
          This form is scaffolded for Supabase email/password auth and keeps a reserved callback
          route at /auth/callback.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="admin@example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    Use a Supabase Auth user once the project is configured.
                  </FormDescription>
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
                    <Input placeholder="Enter your password" type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? 'Signing in...' : 'Continue to PATHWAYS'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
