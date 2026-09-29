'use client'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreFeatureClient } from '@/lib/services/core-feature-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { Eye, Save, Search, Send, ShieldCheck, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export const PublicationQueueWorkspace = ({
  initialProjectId,
}: { initialProjectId?: string } = {}) => {
  const { profile } = useCurrentRole()
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<string | null>(initialProjectId ?? null)
  const [draft, setDraft] = useState<{
    owner: string
    generation: number
    projectId: string
    revision: number
    summary: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const activeOperation = useRef<{ isCurrent: () => boolean } | null>(null)
  const projects = useAuthorizedRead('publication-projects', null, 'public.preview', (signal) =>
    pathwaysClient.getProjects(signal),
  )
  const currentProjects = !projects.isError && !projects.isPending ? projects.data : undefined
  const selected =
    currentProjects?.find((project) => project.id === selection) ??
    (initialProjectId ? null : currentProjects?.[0])
  const id = selected?.id ?? null
  const publication = useAuthorizedRead(
    'publication-detail',
    id,
    'public.preview',
    (signal) => coreFeatureClient.publication(id ?? '', signal),
    Boolean(id),
  )
  const ready = Boolean(id && !publication.isError && !publication.isPending)
  const owner = useSensitiveDraftOwner(
    profile,
    'publication-summary',
    'public.preview',
    id,
    id,
    ready,
  )
  const approveOwner = useSensitiveDraftOwner(
    profile,
    'publication-approve',
    'public.approve',
    id,
    id,
    ready,
  )
  const publishOwner = useSensitiveDraftOwner(
    profile,
    'publication-publish',
    'public.publish',
    id,
    id,
    ready,
  )
  const current = ready ? publication.data : undefined
  const requests = useOperationRequestId()
  const revision = current?.revision ?? 0
  const summary =
    owner &&
    draft?.owner === owner.key &&
    draft.generation === owner.generation &&
    draft.projectId === id &&
    draft.revision === revision
      ? draft.summary
      : (current?.summary ?? '')
  const permitted = (permission: 'public.preview' | 'public.approve' | 'public.publish') =>
    principalHasAtomicPermission(profile, permission)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Clear transient state when its authorization ownership changes.
  useEffect(() => {
    setDraft(null)
    setBusy(false)
    activeOperation.current = null
  }, [owner?.key, owner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: A revoked purpose owner must release the pending UI even while preview remains available.
  useEffect(() => {
    if (activeOperation.current && !activeOperation.current.isCurrent()) {
      activeOperation.current = null
      setBusy(false)
    }
  }, [approveOwner?.key, approveOwner?.generation, publishOwner?.key, publishOwner?.generation])
  const act = async (operation: 'submit' | 'approve' | 'publish' | 'withdraw') => {
    const captured =
      operation === 'approve' ? approveOwner : operation === 'submit' ? owner : publishOwner
    if (!owner?.isCurrent() || !captured?.isCurrent() || !id || !ready || busy) return
    const capturedPreview = owner
    const currentOwner = () => capturedPreview.isCurrent() && captured.isCurrent()
    const operationOwner = { isCurrent: currentOwner }
    activeOperation.current = operationOwner
    const body = {
      operation,
      expectedRevision: revision,
      ...(operation === 'submit' ? { summary: summary.trim() } : {}),
    }
    const clientRequestId = requests.forBody(`${captured.key}:${captured.generation}`, body)
    setBusy(true)
    try {
      await coreFeatureClient.transitionPublication(id, operation, {
        clientRequestId,
        expectedRevision: revision,
        ...(operation === 'submit' ? { summary: summary.trim() } : {}),
      })
      if (!currentOwner()) return
      requests.acknowledge(clientRequestId)
      setDraft(null)
      await publication.refetch()
      if (currentOwner())
        toast.success(
          operation === 'withdraw'
            ? 'Public revision withdrawn.'
            : operation === 'submit'
              ? 'Summary submitted for independent approval.'
              : operation === 'approve'
                ? 'Exact revision approved.'
                : 'Approved revision published.',
        )
    } catch (error) {
      if (currentOwner())
        toast.error(error instanceof Error ? error.message : 'Publication update unavailable.')
    } finally {
      if (activeOperation.current === operationOwner) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const visible =
    currentProjects?.filter(
      (project) =>
        !query.trim() ||
        [project.title, project.area, project.sector].some((value) =>
          value?.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    ) ?? []
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public accountability"
        title="Public Tracker Review"
        description="Submit an allowlisted summary, approve the exact revision, and publish or withdraw it from the anonymous portal."
        actions={
          <Button asChild variant="outline">
            <Link href="/public/projects" target="_blank" rel="noreferrer">
              <Eye className="mr-2 h-4 w-4" />
              Open anonymous portal
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard
          title="Review queue"
          description="Choose a project within your current publication access."
        >
          <Label className="space-y-2">
            <span>Search projects</span>
            <span className="relative block">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </Label>
          {projects.isPending ? (
            <AsyncState
              status="loading"
              title="Loading projects"
              description="Verifying current publication access."
            />
          ) : projects.isError ? (
            <AsyncState
              status="error"
              title="Projects unavailable"
              description="Current publication project access could not be verified."
              onRetry={() => void projects.refetch()}
            />
          ) : (
            <div className="mt-4 space-y-2">
              {visible.length ? (
                visible.map((project) => (
                  <button
                    type="button"
                    aria-pressed={id === project.id}
                    className={`w-full rounded-md border p-4 text-left ${id === project.id ? 'border-primary bg-primary-subtle' : ''}`}
                    key={project.id}
                    onClick={() => {
                      setSelection(project.id)
                      setDraft(null)
                    }}
                  >
                    <span className="font-semibold">{project.title}</span>
                  </button>
                ))
              ) : (
                <EmptyState
                  title="No projects found"
                  description="No projects match your current access and search."
                />
              )}
            </div>
          )}
        </SectionCard>
        <SectionCard
          title={selected?.title ?? 'Public content'}
          description="Only the approved project summary, code, area, sector, and dates cross into the anonymous route. Internal people, expenses, assessment, and media remain private."
        >
          {id && publication.isPending ? (
            <AsyncState
              status="loading"
              title="Loading publication"
              description="Verifying the current revision."
            />
          ) : id && publication.isError ? (
            <AsyncState
              status="error"
              title="Publication unavailable"
              description="Current publication access could not be verified."
              onRetry={() => void publication.refetch()}
            />
          ) : ready && id ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={current?.state === 'PUBLISHED' ? 'success' : 'warning'}>
                  {current?.state === 'PUBLISHED'
                    ? 'Published'
                    : current?.state === 'APPROVED'
                      ? 'Approved, not public'
                      : current
                        ? 'For review'
                        : 'Not submitted'}
                </StatusBadge>
                <span className="text-sm text-muted-foreground">Revision {revision}</span>
              </div>
              <Label className="space-y-2">
                <span>Public summary</span>
                <Textarea
                  rows={6}
                  maxLength={4000}
                  disabled={!owner || busy || current?.state === 'PUBLISHED'}
                  value={summary}
                  onChange={(event) =>
                    owner &&
                    setDraft({
                      owner: owner.key,
                      generation: owner.generation,
                      projectId: id,
                      revision,
                      summary: event.target.value,
                    })
                  }
                />
              </Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={
                    !owner ||
                    busy ||
                    !summary.trim() ||
                    current?.state === 'PUBLISHED' ||
                    !permitted('public.preview')
                  }
                  onClick={() => void act('submit')}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Submit summary
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    !owner ||
                    busy ||
                    current?.state !== 'FOR_REVIEW' ||
                    current.submittedById === profile?.userId ||
                    summary !== current.summary ||
                    !permitted('public.approve')
                  }
                  onClick={() => void act('approve')}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approve revision
                </Button>
                <Button
                  disabled={
                    !owner ||
                    busy ||
                    current?.state !== 'APPROVED' ||
                    summary !== current.summary ||
                    !permitted('public.publish')
                  }
                  onClick={() => void act('publish')}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Publish
                </Button>
                {current?.state === 'PUBLISHED' && (
                  <Button
                    variant="destructive"
                    disabled={!owner || busy || !permitted('public.publish')}
                    onClick={() => void act('withdraw')}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Withdraw
                  </Button>
                )}
              </div>
              {current?.state === 'PUBLISHED' && (
                <Button asChild variant="ghost">
                  <Link href={`/public/projects/${id}`} target="_blank" rel="noreferrer">
                    View published revision
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <EmptyState
              title="Choose a project"
              description="Select a project to review its public summary."
            />
          )}
        </SectionCard>
      </div>
    </div>
  )
}
