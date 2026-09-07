'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'

import { PageHeader } from '@/components/layout/page-header'
import { ConfirmationDialog } from '@/components/pathways/confirmation-dialog'
import { SectionCard } from '@/components/pathways/section-card'
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
import { useSession } from '@/hooks/use-session'
import {
  type ChangePasswordValues,
  type ProfileValues,
  changePasswordSchema,
  profileSchema,
} from './profile-validation'

type Notice = { tone: 'success' | 'info' | 'error'; message: string } | null

const noticeStyles = {
  success: 'border-success/30 bg-success-subtle text-success',
  info: 'border-primary/25 bg-primary-subtle text-light-blue-foreground',
  error: 'border-danger/30 bg-danger-subtle text-danger',
} as const

const FormNotice = ({ notice }: { notice: NonNullable<Notice> }) => {
  const Icon =
    notice.tone === 'success' ? CheckCircle2 : notice.tone === 'error' ? AlertCircle : Info
  return (
    <div
      className={`rounded-md border p-3 text-sm leading-6 ${noticeStyles[notice.tone]}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{notice.message}</p>
      </div>
    </div>
  )
}

export const OwnProfileWorkspace = () => {
  const { email, isPrototypeSession, prototypeSession, updatePrototypeProfile } = useSession()
  const [profileNotice, setProfileNotice] = useState<Notice>(null)
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  const currentProfile = useMemo<ProfileValues>(
    () => ({
      displayName: prototypeSession?.displayName ?? '',
      contactNumber: prototypeSession?.contactNumber ?? '',
      email: prototypeSession?.email ?? email ?? '',
    }),
    [email, prototypeSession],
  )

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: currentProfile,
  })
  const passwordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  useEffect(() => {
    if (!profileForm.formState.isDirty) {
      profileForm.reset(currentProfile)
    }
  }, [currentProfile, profileForm])

  useEffect(() => {
    const warnOnUnload = (event: BeforeUnloadEvent) => {
      if (!profileForm.formState.isDirty) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnOnUnload)
    return () => window.removeEventListener('beforeunload', warnOnUnload)
  }, [profileForm.formState.isDirty])

  const saveProfile = async (values: ProfileValues) => {
    setProfileNotice(null)
    const updated = await updatePrototypeProfile(values)
    if (!updated) {
      setProfileNotice({
        tone: 'error',
        message:
          'Profile changes were not saved. The profile service is unavailable in this frontend-only phase.',
      })
      return
    }
    profileForm.reset(values)
    setProfileNotice({
      tone: 'success',
      message:
        'Prototype profile updated in this browser only. No server profile or audit record was changed.',
    })
  }

  const validatePasswordChange = () => {
    setPasswordNotice({
      tone: 'info',
      message:
        'Password fields are valid. No credential was changed because current-password verification and the provider service are outside this frontend-only phase.',
    })
    passwordForm.reset()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account settings"
        title="My Profile"
        description="Review your contact details and password-change requirements. Prototype edits stay in this browser."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <SectionCard
          title="Profile information"
          description="These fields follow the Manage Profile use case. Required fields are marked."
        >
          <Form {...profileForm}>
            <form className="space-y-5" onSubmit={profileForm.handleSubmit(saveProfile)}>
              <FormField
                control={profileForm.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Name</FormLabel>
                    <FormControl aria-required="true">
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="contactNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact number</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+63 900 000 0000"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Use digits, spaces, +, parentheses, or hyphens.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Email address</FormLabel>
                    <FormControl aria-required="true">
                      <Input autoComplete="email" inputMode="email" {...field} />
                    </FormControl>
                    <FormDescription>
                      This is the contact email shown in your current frontend session.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {profileNotice ? <FormNotice notice={profileNotice} /> : null}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                {profileForm.formState.isDirty ? (
                  <Button
                    className="gap-2"
                    onClick={() => setDiscardOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> Discard changes
                  </Button>
                ) : null}
                <Button
                  className="gap-2"
                  disabled={!profileForm.formState.isDirty || profileForm.formState.isSubmitting}
                  type="submit"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {isPrototypeSession ? 'Update browser profile' : 'Save profile'}
                </Button>
              </div>
            </form>
          </Form>
        </SectionCard>

        <SectionCard
          title="Change password"
          description="Validate the documented current and new password fields."
        >
          <Form {...passwordForm}>
            <form
              className="space-y-5"
              onSubmit={passwordForm.handleSubmit(validatePasswordChange)}
            >
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Current password</FormLabel>
                    <FormControl aria-required="true">
                      <Input
                        autoComplete="current-password"
                        type={showPasswords ? 'text' : 'password'}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>New password</FormLabel>
                    <FormControl aria-required="true">
                      <Input
                        autoComplete="new-password"
                        type={showPasswords ? 'text' : 'password'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Use 15–64 characters with uppercase, lowercase, number, and symbol characters.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Confirm new password</FormLabel>
                    <FormControl aria-required="true">
                      <Input
                        autoComplete="new-password"
                        type={showPasswords ? 'text' : 'password'}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="gap-2"
                onClick={() => setShowPasswords((value) => !value)}
                type="button"
                variant="ghost"
              >
                {showPasswords ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
                {showPasswords ? 'Hide passwords' : 'Show passwords'}
              </Button>
              {passwordNotice ? <FormNotice notice={passwordNotice} /> : null}
              <Button className="w-full" type="submit">
                Validate password change
              </Button>
            </form>
          </Form>
        </SectionCard>
      </div>

      <ConfirmationDialog
        confirmLabel="Discard changes"
        confirmVariant="destructive"
        description="Your unsaved profile edits in this browser will be removed."
        onConfirm={() => {
          profileForm.reset(currentProfile)
          setProfileNotice({ tone: 'info', message: 'Unsaved profile changes were discarded.' })
          setDiscardOpen(false)
        }}
        onOpenChange={setDiscardOpen}
        open={discardOpen}
        title="Discard profile changes?"
      />
    </div>
  )
}
