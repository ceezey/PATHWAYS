'use client'

import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'

type Props = {
  beneficiaries: BeneficiaryRecord[]
  projects: ProjectSummary[]
  selectedProjectId: string
  onProjectChange: (projectId: string) => void
  loadingRecords: boolean
}

export const BeneficiaryDirectory = ({
  beneficiaries,
  projects,
  selectedProjectId,
  onProjectChange,
  loadingRecords,
}: Props) => {
  const [search, setSearch] = useState('')
  const visible = useMemo(() => {
    const query = search.normalize('NFKC').trim().toLowerCase()
    if (!query) return beneficiaries
    return beneficiaries.filter((record) =>
      [record.code, record.displayName].some((value) => value.toLowerCase().includes(query)),
    )
  }, [beneficiaries, search])

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Beneficiaries</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Project-scoped profiles, consent provenance, and enrollment records.
          </p>
        </div>
        <Button asChild>
          <Link href="/beneficiaries/new">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Register beneficiary
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-2">
        <div className="space-y-2">
          <span className="text-sm font-medium">Project scope</span>
          <Select value={selectedProjectId} onValueChange={onProjectChange}>
            <SelectTrigger aria-label="Project scope">
              <SelectValue />
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
        <div className="space-y-2">
          <span className="text-sm font-medium">Search loaded records</span>
          <div className="relative">
            <Search
              className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search beneficiaries"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Code or display name"
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {loadingRecords ? (
          <p className="p-8 text-center text-sm text-muted-foreground" aria-live="polite">
            Loading authorized project records...
          </p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No beneficiary records found in this project.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((record) => (
              <Link
                key={record.id}
                href={`/beneficiaries/${record.id}?projectId=${encodeURIComponent(selectedProjectId)}`}
                className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-foreground">{record.displayName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {record.code} · {record.subjectType.replaceAll('_', ' ')} · {record.location}
                  </p>
                </div>
                <StatusBadge tone={record.enrollmentStatus === 'Active' ? 'success' : 'neutral'}>
                  {record.enrollmentStatus}
                </StatusBadge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
