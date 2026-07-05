'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Info, Loader2, LogIn } from 'lucide-react'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { useSession } from '@/hooks/use-session'
import {
  publicPrototypeAccounts,
  validatePrototypeCredentials,
} from '@/lib/auth/prototype-accounts'
import { createPrototypeSession } from '@/lib/auth/prototype-session'
import { webSetupState } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { type LoginSchema, loginSchema } from './login-validation'

export const LoginForm = () => {
  const router = useRouter()
  const { setRole } = usePrototypeRole()
  const { signInWithPrototype, refreshSession } = useSession()
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: webSetupState.guiPrototypeModeEnabled ? 'program.manager' : '',
      password: '',
    },
  })

  const onSubmit = async (values: LoginSchema) => {
    if (webSetupState.guiPrototypeModeEnabled) {
      const account = validatePrototypeCredentials(values.identifier, values.password)

      if (!account) {
        form.setError('password', {
          type: 'validate',
          message: 'The username, email, or password does not match a demo account.',
        })
        return
      }

      // TODO(AUTH): Replace the GUI prototype session with the finalized Supabase Auth flow.
      await signInWithPrototype(createPrototypeSession(account))
      setRole(account.role)
      toast.success('Prototype session started.', {
        description: `${account.role} dashboard preview is ready.`,
      })
      router.push('/dashboard')
      return
    }

    if (webSetupState.authBypassEnabled) {
      await refreshSession()
      toast.success('Development auth bypass is enabled. Opening the dashboard shell.')
      router.push('/dashboard')
      return
    }

    const supabase = getBrowserSupabaseClient()

    if (!supabase) {
      toast.message('Supabase auth still needs manual setup.', {
        description: 'Add NEXT_PUBLIC_SUPABASE_URL and a Supabase publishable key first.',
      })
      return
    }

    const emailResult = loginSchema
      .extend({
        identifier: loginSchema.shape.identifier.email('Enter a valid staff email.'),
      })
      .safeParse(values)

    if (!emailResult.success) {
      form.setError('identifier', {
        type: 'validate',
        message: 'Enter a valid staff email for Supabase sign-in.',
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
    <Card className="rounded-lg border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          {webSetupState.guiPrototypeModeEnabled
            ? 'Use a configured demo account to preview role-specific dashboards.'
            : 'Use your Supabase email and password when the project auth setup is ready.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username or email</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="username"
                      placeholder={
                        webSetupState.guiPrototypeModeEnabled
                          ? 'program.manager'
                          : 'name@organization.org'
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {webSetupState.guiPrototypeModeEnabled
                      ? 'Demo accounts are available below for this GUI prototype.'
                      : 'Prototype accounts are hidden while GUI prototype mode is disabled.'}
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
                    <div className="relative">
                      <Input
                        aria-label="Password"
                        autoComplete={
                          webSetupState.guiPrototypeModeEnabled ? 'current-password' : 'password'
                        }
                        className="pr-11"
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
                  description={
                    webSetupState.guiPrototypeModeEnabled
                      ? 'Prototype mode does not send recovery emails.'
                      : 'Use the finalized Supabase recovery flow once production auth is configured.'
                  }
                >
                  <p className="text-sm leading-6 text-muted-foreground">
                    {webSetupState.guiPrototypeModeEnabled
                      ? 'Choose one of the safe demo accounts and use the listed prototype password. No real account is changed.'
                      : 'Ask the System Administrator to confirm the Supabase password recovery settings for your environment.'}
                  </p>
                </DialogShell>
              </Dialog>
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                {webSetupState.guiPrototypeModeEnabled
                  ? 'Prototype authentication only'
                  : 'Supabase authentication path'}
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
        {webSetupState.guiPrototypeModeEnabled ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button className="mt-4 w-full" type="button" variant="outline">
                Demo Accounts
              </Button>
            </DialogTrigger>
            <DialogShell
              title="Demo accounts"
              description="Use these safe prototype accounts only when GUI prototype mode is enabled."
            >
              <div className="space-y-3">
                {publicPrototypeAccounts.map((account) => (
                  <button
                    key={account.id}
                    className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => {
                      form.setValue('identifier', account.username)
                      form.setValue('password', 'PathwaysDemo!2026')
                      setRole(account.role)
                    }}
                    type="button"
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {account.role}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Username: {account.username} | Password: PathwaysDemo!2026
                    </span>
                  </button>
                ))}
              </div>
            </DialogShell>
          </Dialog>
        ) : null}
      </CardContent>
    </Card>
  )
}
