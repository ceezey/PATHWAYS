'use client'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/pathways/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STEP_UP_PIN_UI_ENABLED } from '@/constants/feature-flags'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { ownProfileClient } from '@/lib/services/own-profile-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OwnPasswordForm } from './own-password-form'
import { type OwnProfileRecord, ownProfileSchema } from './own-profile-contract'
import { OwnStepUpPinForm } from './own-step-up-pin-form'

export const OwnProfileWorkspace = () => {
  const { session } = useSession()
  const { profile, access } = useCurrentRole()
  const ready = access === 'ready' && Boolean(session && profile && session.user.id === profile.id)
  const draftOwner = useSensitiveDraftOwner(
    profile,
    'own-profile',
    'profile.manage',
    null,
    null,
    ready,
  )
  if (!draftOwner) return <output>Profile access is being verified.</output>
  return (
    <OwnedProfileWorkspace key={`${draftOwner.generation}:${draftOwner.key}`} owner={draftOwner} />
  )
}

const OwnedProfileWorkspace = ({ owner: draftOwner }: { owner: SensitiveDraftOwner }) => {
  const { email } = useSession()
  const { profile, refreshAccess } = useCurrentRole()
  // UI only: the PIN is a Beneficiary step-up fallback, so aggregate-only roles skip it.
  // The API enforces permissions and step-up independently of this section. The PIN UI
  // itself is hidden while STEP_UP_PIN_UI_ENABLED is false (see docs/deferred-features.md).
  const beneficiaryDetail =
    STEP_UP_PIN_UI_ENABLED && Boolean(profile?.permissions.includes('beneficiaries.records.read'))
  const owner = `${draftOwner.generation}:${draftOwner.key}`
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const draftIsCurrent = draftOwner.isCurrent
  const isCurrent = useCallback(() => mounted.current && draftIsCurrent(), [draftIsCurrent])
  const [state, setState] = useState<{ owner: string; record: OwnProfileRecord } | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const latestAttempt = useRef(attempt)
  latestAttempt.current = attempt
  const inFlight = useRef(false)
  const record = state?.owner === owner ? state.record : null

  useEffect(() => {
    let active = true
    const requestAttempt = attempt
    setState(null)
    setNotice('')
    if (isCurrent())
      void ownProfileClient
        .read()
        .then((record) => {
          if (active && requestAttempt === latestAttempt.current && isCurrent())
            setState({ owner, record })
        })
        .catch(() => {
          if (active && requestAttempt === latestAttempt.current && isCurrent())
            setNotice('Profile could not be loaded. Retry after checking your connection.')
        })
    return () => {
      active = false
    }
  }, [owner, attempt, isCurrent])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!record || inFlight.current || !isCurrent()) return
    const parsed = ownProfileSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!parsed.success) {
      setNotice(parsed.error.issues[0]?.message ?? 'Review the profile fields.')
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice('')
    try {
      const updated = await ownProfileClient.update({
        ...parsed.data,
        expectedUpdatedAt: record.updatedAt,
      })
      if (isCurrent()) {
        setState({ owner, record: updated })
        setNotice('Profile saved.')
        refreshAccess()
      }
    } catch {
      if (isCurrent()) setNotice('Profile could not be saved. Reload the profile before retrying.')
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account settings"
        title="My Profile"
        description="Manage your name, contact number, and password."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <SectionCard
          title="Profile information"
          description="Account access and email are managed separately by your organization."
        >
          {record ? (
            <form
              key={`${owner}:${record.updatedAt}`}
              className="space-y-4"
              onSubmit={(event) => void submit(event)}
            >
              <div className="space-y-2">
                <label htmlFor="own-fullName" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="own-fullName"
                  name="fullName"
                  autoComplete="name"
                  defaultValue={record.fullName}
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="own-contactNumber" className="text-sm font-medium">
                  Contact number
                </label>
                <Input
                  id="own-contactNumber"
                  name="contactNumber"
                  autoComplete="tel"
                  defaultValue={record.contactNumber ?? ''}
                  maxLength={30}
                  disabled={busy}
                />
              </div>
              <p className="text-sm">Email address: {email || 'Not recorded'}</p>
              <Button disabled={busy} type="submit">
                {busy ? 'Saving...' : 'Save profile'}
              </Button>
            </form>
          ) : (
            <output className="text-sm">Loading profile...</output>
          )}
          {notice && <output className="mt-4 block text-sm">{notice}</output>}
          <Button
            className="mt-4"
            disabled={busy}
            onClick={() => setAttempt((value) => value + 1)}
            type="button"
            variant="outline"
          >
            Reload profile
          </Button>
        </SectionCard>
        <SectionCard title="Change password" description="Requires a fresh account verification.">
          <OwnPasswordForm />
        </SectionCard>
        {beneficiaryDetail && (
          <SectionCard
            title="Beneficiary access PIN"
            description="A fallback for reopening Beneficiary details in this session."
          >
            <OwnStepUpPinForm />
          </SectionCard>
        )}
      </div>
    </div>
  )
}
