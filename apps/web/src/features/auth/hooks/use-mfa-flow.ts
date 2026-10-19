import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import {
  AuthAccessError,
  type MfaStatus,
  parseMfaStatus,
  requestAuthJson,
} from '@/lib/auth/auth-access'
import {
  getQrImageSource,
  getVerifiedTotpFactors,
  isTotpCode,
  verifyTotpCode,
} from '@/lib/auth/mfa-flow'
import { webEnv } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { useMfaHandoff } from './use-mfa-handoff'

export interface FactorChoice {
  id: string
  status: string
  factor_type: string
}

export const useMfaFlow = () => {
  const router = useRouter()
  const { session, status, configured, refreshSession, signOut } = useSession()
  const {
    access,
    mfaStatus,
    accessError,
    accessRefreshing,
    refreshAccess,
    claimWorkspaceHandoff,
    profile,
  } = useCurrentRole()
  const supabase = getBrowserSupabaseClient()
  const token = session?.access_token ?? null
  const tokenRef = useRef(token)
  tokenRef.current = token
  const operation = useRef(0)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [enrollmentAttempted, setEnrollmentAttempted] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [check, setCheck] = useState<{
    token: string
    refresh: number
    status: MfaStatus
    factors: FactorChoice[]
  } | null>(null)
  const [enrollment, setEnrollment] = useState<{
    token: string
    factorId: string
    qr: string
    secret: string
  } | null>(null)
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const currentUserId = session?.user.id
  const sessionSubject = currentUserId ?? null
  const allowedAccount = Boolean(currentUserId)
  const current =
    mfaStatus &&
    check?.token === token &&
    check?.refresh === refresh &&
    check.status.authUserId === mfaStatus.authUserId &&
    check.status.aal === mfaStatus.aal &&
    check.status.applicationAccessEnabled === mfaStatus.applicationAccessEnabled
      ? check
      : null
  const privateEnrollment = enrollment?.token === token ? enrollment : null
  const verifiedFactors = getVerifiedTotpFactors(current?.factors ?? [])
  const choices = verifiedFactors.length
    ? verifiedFactors
    : (current?.factors.filter((factor) => factor.factor_type === 'totp') ?? [])
  const codeFormVisible = Boolean(
    configured &&
      status !== 'loading' &&
      session &&
      !accepted &&
      current &&
      current.status.aal !== 'aal2' &&
      (privateEnrollment || choices.length > 0),
  )

  const handoff = useMfaHandoff({
    userId: currentUserId,
    status,
    configured,
    allowedAccount,
    current,
    access,
    accessRefreshing,
    claimWorkspaceHandoff,
    profile,
    router,
    setAccepted,
  })

  // Falls back to the code form if the API never confirms aal2 after an accepted code.
  useEffect(() => {
    if (!accepted) return
    const timeout = window.setTimeout(() => {
      setAccepted(false)
      setError(
        'Your code was accepted, but the session could not be confirmed. Reload this page or sign in again.',
      )
    }, 30_000)
    return () => window.clearTimeout(timeout)
  }, [accepted])

  useEffect(() => {
    const controller = new AbortController()
    const currentOperation = ++operation.current
    inFlight.current = false
    setBusy(false)
    setEnrollmentAttempted(false)
    setCode('')
    setEnrollment(null)
    setFactorId('')
    setCheck(null)
    setError('')
    if (!supabase || !token || !allowedAccount || !mfaStatus) return () => controller.abort()

    const inspect = async () => {
      try {
        // The provider owns routine MFA/profile verification. Only explicit
        // enrollment/verification actions below request a fresh MFA precondition.
        const result = mfaStatus
        if (!result || result.authUserId !== sessionSubject) return
        if (controller.signal.aborted || currentOperation !== operation.current) return
        let factors: FactorChoice[] = []
        if (result.aal !== 'aal2') {
          const response = await supabase.auth.mfa.listFactors()
          if (response.error) throw new Error('MFA factor check failed.')
          factors = response.data.all
        }
        if (controller.signal.aborted || currentOperation !== operation.current) return
        setCheck({ token, refresh, status: result, factors })
        const verified = getVerifiedTotpFactors(factors)
        setFactorId(
          verified[0]?.id ?? factors.find((factor) => factor.factor_type === 'totp')?.id ?? '',
        )
      } catch (cause) {
        if (!controller.signal.aborted && currentOperation === operation.current) {
          setError(
            cause instanceof AuthAccessError
              ? cause.message
              : 'The local API returned an invalid MFA status. Stop and ask for review. No access was granted.',
          )
        }
      }
    }
    void inspect()
    return () => {
      controller.abort()
      ++operation.current
    }
  }, [allowedAccount, supabase, token, refresh, mfaStatus, sessionSubject])

  useEffect(() => {
    const clearPrivateState = () => {
      ++operation.current
      setEnrollment(null)
      setCode('')
      setFactorId('')
      setCheck(null)
    }
    window.addEventListener('pagehide', clearPrivateState)
    const recheckRestoredPage = () => setRefresh((value) => value + 1)
    window.addEventListener('pageshow', recheckRestoredPage)
    return () => {
      window.removeEventListener('pagehide', clearPrivateState)
      window.removeEventListener('pageshow', recheckRestoredPage)
    }
  }, [])

  const assertCurrentSession = async (expectedToken: string, expectedOperation: number) => {
    if (
      !supabase ||
      tokenRef.current !== expectedToken ||
      operation.current !== expectedOperation
    ) {
      throw new Error('Session changed. Sign in again.')
    }
    const result = await supabase.auth.getSession()
    if (
      result.error ||
      result.data.session?.access_token !== expectedToken ||
      result.data.session.user.id !== currentUserId ||
      tokenRef.current !== expectedToken ||
      operation.current !== expectedOperation
    ) {
      throw new Error('Session changed. Sign in again.')
    }
  }

  const enroll = async () => {
    if (
      !supabase ||
      !token ||
      !current ||
      !allowedAccount ||
      inFlight.current ||
      enrollmentAttempted
    )
      return
    inFlight.current = true
    setEnrollmentAttempted(true)
    const currentOperation = ++operation.current
    setBusy(true)
    setError('')
    setCode('')
    try {
      const fresh = parseMfaStatus(
        await requestAuthJson(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          '/auth/mfa/status',
          token,
          undefined,
          undefined,
          undefined,
          webEnv.NEXT_PUBLIC_API_BASE_URL,
        ),
      )
      if (fresh.authUserId !== currentUserId || fresh.aal !== 'aal1')
        throw new Error('No enrollment is needed.')
      await assertCurrentSession(token, currentOperation)
      const existing = await supabase.auth.mfa.listFactors()
      if (existing.error || existing.data.all.length !== 0) {
        throw new Error('An existing factor must be preserved.')
      }
      await assertCurrentSession(token, currentOperation)
      // Mutation requires this explicit button click; no effect ever enrolls or removes a factor.
      const result = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (result.error) throw new Error('Enrollment could not be confirmed.')
      if (operation.current !== currentOperation || tokenRef.current !== token) return
      setEnrollment({
        token,
        factorId: result.data.id,
        qr: getQrImageSource(result.data.totp.qr_code),
        secret: result.data.totp.secret,
      })
      setFactorId(result.data.id)
    } catch {
      if (operation.current === currentOperation) {
        setError(
          'Setup could not be confirmed. Do not repeatedly enroll. Recheck existing factors; no factor was deleted or replaced.',
        )
      }
    } finally {
      if (operation.current === currentOperation) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  const verify = async () => {
    if (!supabase || !token || !allowedAccount || !current || inFlight.current) return
    if (!isTotpCode(code)) {
      setError('Enter exactly six digits from your authenticator app.')
      return
    }
    const selectedFactor = privateEnrollment?.factorId ?? factorId
    if (!privateEnrollment && !choices.some((factor) => factor.id === selectedFactor)) return
    inFlight.current = true
    const currentOperation = ++operation.current
    setBusy(true)
    setError('')
    const submittedCode = code
    setCode('')
    try {
      const fresh = parseMfaStatus(
        await requestAuthJson(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          '/auth/mfa/status',
          token,
          undefined,
          undefined,
          undefined,
          webEnv.NEXT_PUBLIC_API_BASE_URL,
        ),
      )
      if (fresh.authUserId !== currentUserId || fresh.aal !== 'aal1')
        throw new Error('Recheck the current session.')
      await verifyTotpCode(supabase.auth.mfa, selectedFactor, submittedCode, () =>
        assertCurrentSession(token, currentOperation),
      )
      setEnrollment(null)
      setAccepted(true)
      // Supabase emits the changed MFA session. The effect/API re-check decides
      // whether aal2 is verified; this success never unlocks business routes.
      await refreshSession()
      refreshAccess()
      setRefresh((value) => value + 1)
    } catch {
      if (operation.current === currentOperation) {
        setAccepted(false)
        setError(
          'Verification was not accepted. Try the next six-digit code. If your session changed, sign in again.',
        )
      }
    } finally {
      if (operation.current === currentOperation) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-submit fires only when the code changes.
  useEffect(() => {
    if (isTotpCode(code)) void verify()
  }, [code])

  // Keeps the current card in place during sign-out so no signed-out view flashes before login.
  const leave = async () => {
    ++operation.current
    setLeaving(true)
    setBusy(true)
    try {
      await signOut()
      router.replace('/staff/login')
    } catch {
      setLeaving(false)
      setAccepted(false)
      setEnrollment(null)
      setCode('')
      setCheck(null)
      setFactorId('')
      setError(
        'Sign-out could not be confirmed. Close this private browser window before continuing.',
      )
    } finally {
      setBusy(false)
    }
  }

  return {
    session,
    status,
    configured,
    access,
    accessError,
    accessRefreshing,
    handoff,
    accepted,
    leaving,
    busy,
    error,
    current,
    privateEnrollment,
    choices,
    verifiedFactors,
    factorId,
    setFactorId,
    code,
    setCode,
    codeFormVisible,
    enrollmentAttempted,
    enroll,
    verify,
    leave,
  }
}
