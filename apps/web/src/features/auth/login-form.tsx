'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Info, Loader2, LogIn, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
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

export const LoginForm = () => {
  const router = useRouter()
  const { refreshSession } = useSession()
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
    },
  })

  const onSubmit = async (values: LoginSchema) => {
    const supabase = getBrowserSupabaseClient()

    if (!supabase) {
      toast.error('Supabase authentication is not configured.', {
        description: 'Add the Supabase project URL and publishable key before signing in.',
      })
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: values.identifier,
      password: values.password,
    })

    if (error) {
      toast.error('Could not sign in.', {
        description: error.message,
      })
      return
    }

    await refreshSession()
    toast.success('Session established.')
    router.push('/dashboard')
  }

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
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="username"
                      className="border-0 border-b border-border bg-transparent px-0 shadow-none focus-visible:ring-0"
                      placeholder="name@organization.org"
                      type="email"
                      {...field}
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
                        className="border-0 border-b border-border bg-transparent px-0 pr-11 shadow-none focus-visible:ring-0"
                        placeholder="Enter your password"
                        type={showPassword ? 'text' : 'password'}
                        {...field}
                      />
                      <Button
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1 top-1 h-8 w-8"
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    className="w-fit px-0 underline-offset-4 hover:underline"
                    type="button"
                    variant="ghost"
                  >
                    Forgot Password?
                  </Button>
                </DialogTrigger>
                <DialogShell
                  title="Password recovery"
                  description="Password recovery is not yet available in this application."
                >
                  <p className="text-sm leading-6 text-muted-foreground">
                    Ask the System Administrator to confirm the Supabase password recovery settings
                    for your environment.
                  </p>
                </DialogShell>
              </Dialog>
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                Supabase authentication
              </p>
            </div>
            <Button className="w-full gap-2" disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              {form.formState.isSubmitting ? 'Logging in...' : 'Log In'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
