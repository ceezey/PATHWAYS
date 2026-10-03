'use client'

import { ArrowLeft, Link2, SearchCheck, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { ConfirmationDialog, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSafeProjectSelection } from '@/hooks/use-safe-project-selection'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import {
  type DuplicateCandidatePair,
  type DuplicateProfile,
  pathwaysClient,
} from '@/lib/services/pathways-client'
import type { ProjectSummary } from '@/types/pathways'

type Decision = 'KEEP_DISTINCT' | 'LINK'

const pairId = (pair: DuplicateCandidatePair) => `${pair.left.code} / ${pair.right.code}`
const failure = 'Duplicate candidates could not be loaded. Try again.'

export const DuplicateResolutionWorkspace = () => {
  const { role, profile } = useCurrentRole()
  const canReview = isUiActionAvailable(role, 'beneficiaries.merge', profile)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useSafeProjectSelection(projects.map((project) => project.id))
  const [pairs, setPairs] = useState<DuplicateCandidatePair[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [decision, setDecision] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!role) return
    let active = true
    pathwaysClient
      .getProjectsForRole(role)
      .then((rows) => active && setProjects(rows))
      .catch(() => active && setStatus('failed'))
    return () => {
      active = false
    }
  }, [role])

  const load = useCallback(async () => {
    if (!projectId) return
    setStatus('loading')
    try {
      setPairs(await pathwaysClient.getDuplicateCandidates(projectId))
      setStatus('ready')
    } catch {
      setStatus('failed')
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? pairs.filter((pair) =>
          [pair.left.code, pair.right.code, pair.left.name].some((value) =>
            value.toLocaleLowerCase().includes(normalized),
          ),
        )
      : pairs
  }, [pairs, query])
  const selected = visible.find((pair) => pairId(pair) === selectedKey) ?? visible[0]

  const confirmDecision = async () => {
    if (!selected || !decision) return
    setBusy(true)
    try {
      await pathwaysClient.resolveDuplicate(projectId, {
        leftId: selected.left.id,
        rightId: selected.right.id,
        decision,
      })
      toast.success(
        decision === 'LINK'
          ? 'Profiles linked as the same person. The decision is audited.'
          : 'Profiles kept as distinct people. The decision is audited.',
      )
      setDecision(null)
      await load()
    } catch {
      setStatus('failed')
      setDecision(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Beneficiaries / Data quality"
        title="Possible Duplicate Review"
        description="Compare potentially matching records before deciding whether they describe one person or distinct people."
        actions={
          <Button asChild variant="outline">
            <Link href="/beneficiaries">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to beneficiaries
            </Link>
          </Button>
        }
      />

      {status === 'failed' ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger-subtle px-4 py-3 text-sm leading-6 text-danger"
        >
          {failure}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard
          title="Review queue"
          description="Profiles in the project that share a name and birth date."
          className="rounded-lg"
        >
          <div className="space-y-3">
            {projects.length > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="duplicate-project">Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="duplicate-project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="duplicate-search">Search queue</Label>
              <Input
                id="duplicate-search"
                type="search"
                placeholder="Name or code"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {visible.length ? (
              visible.map((pair) => (
                <button
                  key={pairId(pair)}
                  type="button"
                  className={`min-h-11 w-full rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selected && pairId(selected) === pairId(pair) ? 'border-primary bg-primary-subtle' : 'hover:border-primary/40'}`}
                  onClick={() => setSelectedKey(pairId(pair))}
                  aria-pressed={selected ? pairId(selected) === pairId(pair) : false}
                >
                  <p className="text-sm font-semibold">{pair.left.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pairId(pair)}</p>
                </button>
              ))
            ) : (
              <EmptyState
                icon={UsersRound}
                title="No possible matches"
                description={
                  status === 'loading' ? 'Loading candidates.' : 'No unreviewed matches were found.'
                }
              />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={selected ? `Compare ${pairId(selected)}` : 'Record comparison'}
          description="Review differences and matching evidence before deciding."
          className="rounded-lg"
        >
          {selected ? (
            <div className="space-y-6">
              <StatusBadge tone="neutral">Same name and birth date</StatusBadge>
              <div className="grid gap-4 lg:grid-cols-2">
                <PersonCard label="Existing profile" person={selected.left} />
                <PersonCard label="Potential match" person={selected.right} />
              </div>
              {canReview ? (
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDecision('KEEP_DISTINCT')}
                  >
                    <SearchCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                    Keep as distinct people
                  </Button>
                  <Button type="button" onClick={() => setDecision('LINK')}>
                    <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Merge linked profiles
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <ConfirmationDialog
        confirmLabel={busy ? 'Saving' : 'Confirm decision'}
        confirmVariant="default"
        description={
          decision === 'LINK'
            ? 'Both profiles stay and keep their own records; the link is recorded in the audit trail and the pair leaves the queue.'
            : 'Both profiles stay and the reviewed decision is recorded in the audit trail.'
        }
        onConfirm={() => void (busy || confirmDecision())}
        onOpenChange={(open) => !open && setDecision(null)}
        open={Boolean(decision)}
        title={
          decision === 'LINK'
            ? 'Link these profiles as one person?'
            : 'Keep these profiles distinct?'
        }
      />
    </div>
  )
}

const PersonCard = ({
  label,
  person,
}: {
  label: string
  person: DuplicateProfile
}) => (
  <section className="rounded-lg border bg-card p-5" aria-label={label}>
    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
    <h2 className="mt-2 text-lg font-semibold">{person.name}</h2>
    <p className="text-sm text-muted-foreground">{person.code}</p>
    <dl className="mt-5 space-y-3 text-sm">
      {(
        [
          ['Birth date', person.birthDate],
          ['Location', person.location || 'Not recorded'],
          ['Last updated', person.updatedAt.slice(0, 10)],
        ] as const
      ).map(([term, value]) => (
        <div key={term} className="grid grid-cols-[110px_1fr] gap-3">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  </section>
)
