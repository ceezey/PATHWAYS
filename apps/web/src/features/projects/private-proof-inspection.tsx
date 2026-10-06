'use client'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import { type PrivateProofContext, privateProofClient } from '@/lib/services/private-proof-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PrivateProofPreview } from './private-proof-preview'

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
    }
  }, [current, projectId, activityId, updateId, attempt])
  const inspect = async (evidenceId: string, signal: AbortSignal) => {
    if (!context) throw new Error('Private proof unavailable.')
    try {
      return await privateProofClient.inspect(projectId, context, evidenceId, signal)
    } catch (error) {
      if (current() && error instanceof PathwaysClientError && error.status === 409) {
        setContext(null)
        setAttempt((value) => value + 1)
      }
      throw error
    }
  }
  return (
    <section aria-label="Private proof verification" className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Preview or download only to verify this pending update. Inspection does not establish
        consent or authorize publication.
      </p>
      {context?.proofs.map((proof, index) => (
        <PrivateProofPreview
          key={proof.id}
          isCurrent={current}
          fetchProof={(signal) => inspect(proof.id, signal)}
          label={`Preview privately for verification: ${proof.label} ${index + 1}`}
          title={`${proof.label} ${index + 1}`}
        />
      ))}
      {notice && (
        <output aria-live="polite" className="block text-sm">
          {notice}
        </output>
      )}
      <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
        Reload private proof context
      </Button>
    </section>
  )
}
