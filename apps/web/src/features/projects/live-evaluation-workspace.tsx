'use client'
import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  EmptyState,
  LoadingSkeleton,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreDataClient } from '@/lib/services/core-feature-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const types = [
  'KPI',
  'TIMELINE_COMPLIANCE',
  'BUDGET_EFFICIENCY',
  'BENEFICIARY_REACH',
  'OTHER',
] as const
type Draft = {
  localId: string
  code: string
  name: string
  type: (typeof types)[number]
  weightPercentage: string
  maximumScore: string
}
const blank = (): Draft => ({
  localId: crypto.randomUUID(),
  code: '',
  name: '',
  type: 'KPI',
  weightPercentage: '',
  maximumScore: '100',
})
export function LiveEvaluationWorkspace({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const boundary = useSensitiveDraftOwner(
    profile,
    'evaluation-screen',
    'monitoring.read',
    projectId,
    projectId,
  )
  return (
    <EvaluationContent
      key={`${boundary?.key ?? 'unavailable'}:${boundary?.generation ?? 0}`}
      projectId={projectId}
    />
  )
}
function EvaluationContent({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const read = useAuthorizedRead('project-evaluation', projectId, 'monitoring.read', (signal) =>
    coreDataClient.evaluation(projectId, signal),
  )
  const current = !read.isError && !read.isPending ? read.data : undefined
  const owner = useSensitiveDraftOwner(
    profile,
    'evaluation-weights',
    'evaluations.weights.configure',
    projectId,
    current?.criteria.map((row) => `${row.id}:${row.updatedAt}`).join('|') ?? null,
    Boolean(current),
  )
  const initOwner = useSensitiveDraftOwner(
    profile,
    'evaluation-initialization',
    'settings.configure',
    projectId,
    projectId,
    Boolean(current),
  )
  const [weightDraft, setWeightDraft] = useState<{
    key: string
    generation: number
    values: Record<string, string>
  } | null>(null)
  const weights =
    weightDraft &&
    owner &&
    weightDraft.key === owner.key &&
    weightDraft.generation === owner.generation
      ? weightDraft.values
      : {}
  const [drafts, setDrafts] = useState<Draft[]>([blank()])
  const [busy, setBusy] = useState(false)
  const activeOperation = useRef<{ isCurrent: () => boolean } | null>(null)
  const requests = useOperationRequestId()
  // biome-ignore lint/correctness/useExhaustiveDependencies: A refreshed criterion revision invalidates the old editor and pending operation.
  useEffect(() => {
    setWeightDraft(null)
  }, [owner?.key, owner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Criterion setup drafts belong to the current initialization grant and identity.
  useEffect(() => {
    setDrafts([blank()])
  }, [initOwner?.key, initOwner?.generation])
  useEffect(() => {
    if (activeOperation.current && !activeOperation.current.isCurrent()) {
      activeOperation.current = null
      setBusy(false)
    }
  })
  const configure = async () => {
    if (!owner?.isCurrent() || !current || busy || activeOperation.current) return
    const captured = owner
    activeOperation.current = captured
    setBusy(true)
    try {
      await coreDataClient.configureWeights(projectId, {
        criteria: current.criteria
          .filter((row) => row.status === 'DRAFT')
          .map((row) => ({
            id: row.id,
            weightPercentage: Number(weights[row.id] ?? row.weightPercentage),
            expectedUpdatedAt: row.updatedAt,
          })),
      })
      if (captured.isCurrent()) {
        setWeightDraft(null)
        await read.refetch()
        if (captured.isCurrent()) toast.success('Draft weights configured.')
      }
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Weight update unavailable.')
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const initialize = async () => {
    if (!initOwner?.isCurrent() || busy || activeOperation.current) return
    const captured = initOwner
    const body = {
      criteria: drafts.map((row) => ({
        code: row.code.trim(),
        name: row.name.trim(),
        type: row.type,
        weightPercentage: Number(row.weightPercentage),
        maximumScore: Number(row.maximumScore),
      })),
    }
    const clientRequestId = requests.forBody(`${captured.key}:${captured.generation}`, body)
    activeOperation.current = captured
    setBusy(true)
    try {
      await coreDataClient.initializeCriteria(projectId, {
        clientRequestId,
        ...body,
      })
      if (captured.isCurrent()) {
        requests.acknowledge(clientRequestId)
        setDrafts([blank()])
        await read.refetch()
        if (captured.isCurrent()) toast.success('Initial draft criteria configured.')
      }
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Criterion setup unavailable.')
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const edit = (index: number, key: keyof Draft, value: string) =>
    setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project review"
        title="Monitor & Evaluate"
        description="Review persisted evaluation information and configure draft criterion weights."
      />
      <SectionCard
        title="Evaluation history"
        description="Only persisted evaluation results appear here."
      >
        {read.isPending ? (
          <AsyncState
            status="loading"
            title="Loading evaluation"
            description="Verifying current project scope."
          />
        ) : read.isError ? (
          <AsyncState
            status="error"
            title="Evaluation unavailable"
            description="Current monitoring access could not be verified."
            onRetry={() => void read.refetch()}
          />
        ) : current?.evaluation ? (
          <div>
            <p className="font-semibold">{current.evaluation.title}</p>
            <p>
              {current.evaluation.periodStart} to {current.evaluation.periodEnd}
            </p>
            <StatusBadge>{current.evaluation.status}</StatusBadge>
            <p className="mt-3">
              Overall score: {current.evaluation.overallScore ?? 'Not available'}
            </p>
          </div>
        ) : (
          <EmptyState
            title="No persisted evaluation"
            description="Draft criterion configuration does not create evaluations or scores."
          />
        )}
      </SectionCard>
      <SectionCard
        title="Evaluation criteria"
        description="Published criterion definitions remain immutable; current configuration changes only draft weights."
      >
        {read.isPending && !read.isError ? (
          <LoadingSkeleton />
        ) : read.isError ? (
          <output>
            Current criteria access could not be verified. Reload the evaluation to continue.
          </output>
        ) : current?.criteria.length ? (
          <div className="space-y-4">
            {current.criteria.map((row) => (
              <div key={row.id} className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
                <div>
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.code} · {row.type} · Version {row.version}
                  </p>
                  <StatusBadge>{row.status}</StatusBadge>
                </div>
                <Label className="space-y-2">
                  <span>Weight (%)</span>
                  <Input
                    type="number"
                    min="0.0001"
                    max="100"
                    step="0.0001"
                    disabled={!owner || row.status !== 'DRAFT' || busy}
                    value={weights[row.id] ?? row.weightPercentage}
                    onChange={(event) =>
                      owner?.isCurrent() &&
                      setWeightDraft({
                        key: owner.key,
                        generation: owner.generation,
                        values: { ...weights, [row.id]: event.target.value },
                      })
                    }
                  />
                </Label>
                <p>Maximum score: {row.maximumScore}</p>
              </div>
            ))}
            {owner && current.criteria.some((row) => row.status === 'DRAFT') ? (
              <Button disabled={busy} onClick={() => void configure()}>
                {busy ? 'Saving' : 'Save draft weights'}
              </Button>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="No configured criteria"
            description="An authorized administrator can initialize a project rubric before weight configuration."
          />
        )}
      </SectionCard>
      {initOwner &&
      !read.isError &&
      current?.criteria.length === 0 &&
      principalHasAtomicPermission(profile, 'settings.configure') ? (
        <SectionCard
          title="Initial draft rubric"
          description="Define this project's criteria. Positive weights must total 100 percent; no score or evaluation history is created."
        >
          <div className="space-y-4">
            {drafts.map((row, index) => (
              <fieldset
                key={row.localId}
                disabled={busy}
                className="grid gap-3 rounded-md border p-4 md:grid-cols-5"
              >
                <legend className="px-1 text-sm font-semibold">Criterion {index + 1}</legend>
                <Label>
                  Code
                  <Input
                    maxLength={80}
                    value={row.code}
                    onChange={(event) => edit(index, 'code', event.target.value)}
                  />
                </Label>
                <Label>
                  Name
                  <Input
                    maxLength={200}
                    value={row.name}
                    onChange={(event) => edit(index, 'name', event.target.value)}
                  />
                </Label>
                <Label>
                  Type
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={row.type}
                    onChange={(event) => edit(index, 'type', event.target.value)}
                  >
                    {types.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </Label>
                <Label>
                  Weight (%)
                  <Input
                    type="number"
                    min="0.0001"
                    max="100"
                    step="0.0001"
                    value={row.weightPercentage}
                    onChange={(event) => edit(index, 'weightPercentage', event.target.value)}
                  />
                </Label>
                <Label>
                  Maximum score
                  <Input
                    type="number"
                    min="0.0001"
                    max="1000000"
                    step="0.0001"
                    value={row.maximumScore}
                    onChange={(event) => edit(index, 'maximumScore', event.target.value)}
                  />
                </Label>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={busy || drafts.length >= 100}
                onClick={() => setDrafts((rows) => [...rows, blank()])}
              >
                Add criterion
              </Button>
              <Button
                variant="outline"
                disabled={busy || drafts.length <= 1}
                onClick={() => setDrafts((rows) => rows.slice(0, -1))}
              >
                Remove last criterion
              </Button>
              <Button
                disabled={
                  busy ||
                  drafts.some(
                    (row) =>
                      !row.code.trim() ||
                      !row.name.trim() ||
                      !row.weightPercentage.trim() ||
                      !row.maximumScore.trim(),
                  )
                }
                onClick={() => void initialize()}
              >
                Initialize draft rubric
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}
