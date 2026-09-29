'use client'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import { type PrivateProofContext, privateProofClient } from '@/lib/services/private-proof-client'
import { useCallback, useEffect, useRef, useState } from 'react'

export function PrivateProofInspection({
  projectId,
  activityId,
  updateId,
}: {
  projectId: string
  activityId: string
  updateId: string
}) {
  const { profile, access } = useCurrentRole()
  const enabled =
    access === 'ready' &&
    profile?.roles[0] === 'MONITORING_AND_EVALUATION_OFFICER' &&
    profile.permissions.includes('evidence.read')
  const owner = useSensitiveDraftOwner(
    profile,
    'private-proof-inspection',
    'evidence.review',
    projectId,
    JSON.stringify([activityId, updateId]),
    enabled,
  )
  return owner ? (
    <OwnedInspection
      key={`${owner.generation}:${owner.key}`}
      owner={owner}
      projectId={projectId}
      activityId={activityId}
      updateId={updateId}
    />
  ) : null
}
function OwnedInspection({
  owner,
  projectId,
  activityId,
  updateId,
}: {
  owner: SensitiveDraftOwner
  projectId: string
  activityId: string
  updateId: string
}) {
  const [context, setContext] = useState<PrivateProofContext | null>(null)
  const [notice, setNotice] = useState('Loading private proof context...')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const transfer = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const current = useCallback(() => mounted.current && owner.isCurrent(), [owner])
  // biome-ignore lint/correctness/useExhaustiveDependencies: The retry counter deliberately restarts the same scoped request.
  useEffect(() => {
    mounted.current = true
    let active = true
    setContext(null)
    setNotice('Loading private proof context...')
    void privateProofClient
      .context(projectId, activityId, updateId)
      .then((result) => {
        if (!active || !current()) return
        setContext(result)
        setNotice(result.proofs.length ? '' : 'No private proof is available for inspection.')
      })
      .catch(() => {
        if (active && current())
          setNotice('Private inspection is unavailable. Reload after checking your access.')
      })
    return () => {
      active = false
      mounted.current = false
      transfer.current?.abort()
    }
  }, [current, projectId, activityId, updateId, attempt])
  const inspect = async (evidenceId: string) => {
    if (!current() || pending.current || !context) return
    pending.current = true
    setBusy(true)
    setNotice('Checking access and downloading privately...')
    const controller = new AbortController()
    transfer.current = controller
    try {
      const blob = await privateProofClient.inspect(
        projectId,
        context,
        evidenceId,
        controller.signal,
      )
      if (!current()) return
      // One explicit user-requested attachment; never retain bytes/URL in state or caches.
      const url = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'activity-proof.bin'
        anchor.click()
      } finally {
        URL.revokeObjectURL(url)
      }
      setNotice('Private download admitted. This does not authorize publication.')
    } catch (error) {
      if (!current()) return
      if (error instanceof PathwaysClientError && error.status === 409) {
        setContext(null)
        setAttempt((value) => value + 1)
      } else setNotice('Private inspection is unavailable. Reload after checking your access.')
    } finally {
      pending.current = false
      transfer.current = null
      if (current()) setBusy(false)
    }
  }
  return (
    <section aria-label="Private proof verification" className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Download only to verify this pending update. Inspection does not establish consent or
        authorize publication.
      </p>
      {context?.proofs.map((proof, index) => (
        <Button
          key={proof.id}
          type="button"
          disabled={busy}
          variant="outline"
          onClick={() => void inspect(proof.id)}
        >
          Download privately for verification: {proof.label} {index + 1}
        </Button>
      ))}
      {notice && (
        <output aria-live="polite" className="block text-sm">
          {notice}
        </output>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => setAttempt((value) => value + 1)}
      >
        Reload private proof context
      </Button>
    </section>
  )
}
