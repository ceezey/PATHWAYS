'use client'

import { ArrowLeft, CheckCircle2, Link2, SearchCheck, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveDuplicate } from '@/lib/demo-state/beneficiaries'

type DuplicateCandidate = {
  id: string
  leftId: string
  rightId: string
  confidence: 'High' | 'Medium'
  reasons: string[]
  left: PersonSummary
  right: PersonSummary
}

type PersonSummary = {
  code: string
  name: string
  birthDate: string
  location: string
  project: string
  contact: string
  updatedAt: string
}

const candidates: DuplicateCandidate[] = [
  {
    id: 'DUP-0041',
    leftId: 'ben-001',
    rightId: 'ben-004',
    confidence: 'High',
    reasons: ['Same contact number', 'Matching birth date', 'Similar normalized name'],
    left: {
      code: 'BEN-NCR-001',
      name: 'Ana M. Santos',
      birthDate: '10 May 2003',
      location: 'Quezon City',
      project: 'FutureMakers NCR',
      contact: '+63 917 ••• 4567',
      updatedAt: '06 Sep 2026',
    },
    right: {
      code: 'BEN-NCR-104',
      name: 'Ana Santos',
      birthDate: '10 May 2003',
      location: 'Quezon City',
      project: 'FutureMakers NCR',
      contact: '+63 917 ••• 4567',
      updatedAt: '08 Sep 2026',
    },
  },
  {
    id: 'DUP-0038',
    leftId: 'ben-002',
    rightId: 'ben-003',
    confidence: 'Medium',
    reasons: ['Matching name', 'Nearby location', 'Different contact number'],
    left: {
      code: 'BEN-WS-014',
      name: 'Marco Reyes',
      birthDate: '22 Aug 2009',
      location: 'Calbayog',
      project: 'Youth RISE - Western Samar',
      contact: '+63 918 ••• 1124',
      updatedAt: '31 Aug 2026',
    },
    right: {
      code: 'BEN-WS-098',
      name: 'Marco A. Reyes',
      birthDate: 'Not recorded',
      location: 'Catbalogan',
      project: 'Youth RISE - Western Samar',
      contact: '+63 917 ••• 7721',
      updatedAt: '07 Sep 2026',
    },
  },
]

export const DuplicateResolutionWorkspace = () => {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '')
  const [decision, setDecision] = useState<'link' | 'distinct' | null>(null)
  const [notice, setNotice] = useState('')
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? candidates.filter((candidate) =>
          [
            candidate.id,
            candidate.left.code,
            candidate.right.code,
            candidate.left.name,
            candidate.right.name,
          ].some((value) => value.toLocaleLowerCase().includes(normalized)),
        )
      : candidates
  }, [query])
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? visible[0]

  const confirmDecision = () => {
    if (!selected || !decision) return
    try {
      resolveDuplicate(selected.leftId, selected.rightId, decision)
      setNotice(
        decision === 'link'
          ? 'Profiles merged in browser-local demo data; linked enrollments and history were retained.'
          : 'Profiles marked distinct; the review decision was added to local history.',
      )
      setDecision(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Decision could not be saved.')
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

      <div className="rounded-lg border border-warning/25 bg-warning-subtle px-4 py-3 text-sm leading-6 text-warning">
        This workspace uses fictional profiles. Project Managers may merge profiles; other allowed
        beneficiary roles can inspect the queue and flag a match for management review.
      </div>

      {notice ? (
        <output className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-subtle px-4 py-3 text-sm leading-6 text-success">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          {notice}
        </output>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard
          title="Review queue"
          description={`${visible.length} possible match${visible.length === 1 ? '' : 'es'} shown.`}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="duplicate-search">Search queue</Label>
              <Input
                id="duplicate-search"
                type="search"
                placeholder="Name, code, or match ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {visible.length ? (
              visible.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={`w-full rounded-md border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selected?.id === candidate.id ? 'border-primary bg-primary-subtle' : 'hover:border-primary/40'}`}
                  onClick={() => setSelectedId(candidate.id)}
                  aria-pressed={selected?.id === candidate.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {candidate.id}
                    </span>
                    <StatusBadge tone={candidate.confidence === 'High' ? 'warning' : 'neutral'}>
                      {candidate.confidence}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{candidate.left.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {candidate.left.code} / {candidate.right.code}
                  </p>
                </button>
              ))
            ) : (
              <EmptyState
                icon={UsersRound}
                title="No possible matches"
                description="Change the search term to return to the review queue."
              />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={selected ? `Compare ${selected.id}` : 'Record comparison'}
          description="Review differences and matching evidence before retaining or merging records."
        >
          {selected ? (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {selected.reasons.map((reason) => (
                  <StatusBadge key={reason} tone="neutral">
                    {reason}
                  </StatusBadge>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <PersonCard label="Existing profile" person={selected.left} />
                <PersonCard label="Potential match" person={selected.right} />
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setDecision('distinct')}>
                  <SearchCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  Keep as distinct people
                </Button>
                <Button type="button" onClick={() => setDecision('link')}>
                  <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Merge linked profiles
                </Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <Dialog open={Boolean(decision)} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'link'
                ? 'Flag these profiles as related?'
                : 'Keep these profiles distinct?'}
            </DialogTitle>
            <DialogDescription>
              {decision === 'link'
                ? 'The right profile will be merged into the existing profile. Enrollments, participation, assessments, and notes are retained; this demo action is audited.'
                : 'Both profiles will remain and the reviewed decision will be retained in browser-local history.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button onClick={confirmDecision}>Confirm decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const PersonCard = ({ label, person }: { label: string; person: PersonSummary }) => (
  <section className="rounded-md border bg-card p-5" aria-label={label}>
    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
    <h2 className="mt-2 text-lg font-semibold">{person.name}</h2>
    <p className="text-sm text-muted-foreground">{person.code}</p>
    <dl className="mt-5 space-y-3 text-sm">
      {(
        [
          ['Birth date', person.birthDate],
          ['Location', person.location],
          ['Project', person.project],
          ['Contact', person.contact],
          ['Last updated', person.updatedAt],
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
