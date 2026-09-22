'use client'

import { Plus, Search } from 'lucide-react'
import Link from 'next/link'

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

import type { BeneficiaryFilters, BeneficiaryRecord, ProjectSummary } from '@/types/pathways'

type Props = {
  beneficiaries: BeneficiaryRecord[]
  projects: ProjectSummary[]
  selectedProjectId: string
  onProjectChange: (projectId: string) => void
  filters: BeneficiaryFilters
  onFiltersChange: (filters: BeneficiaryFilters) => void
  loadingRecords: boolean
  recordsFailed: boolean
}

export const BeneficiaryDirectory = ({
  beneficiaries,
  projects,
  selectedProjectId,
  onProjectChange,
  filters,
  onFiltersChange,
  loadingRecords,
  recordsFailed,
}: Props) => {
  const visible = beneficiaries

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

      <section className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-sm md:grid-cols-2 xl:grid-cols-6">
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
          <span className="text-sm font-medium">Search beneficiaries</span>
          <div className="relative">
            <Search
              className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search beneficiaries"
              className="pl-9"
              value={filters.search ?? ''}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  search: event.target.value,
                })
              }
              placeholder="Code or display name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Sex</span>
          <Select
            value={filters.sex ?? 'ALL'}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                sex: value === 'ALL' ? undefined : (value as BeneficiaryFilters['sex']),
              })
            }
          >
            <SelectTrigger aria-label="Sex">
              <SelectValue placeholder="All sex values" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="FEMALE">Female</SelectItem>
              <SelectItem value="MALE">Male</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
              <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
              <SelectItem value="NOT_SPECIFIED">Not specified</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Age band</span>
          <Select
            value={filters.ageBand ?? 'ALL'}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                ageBand: value === 'ALL' ? undefined : (value as BeneficiaryFilters['ageBand']),
              })
            }
          >
            <SelectTrigger aria-label="Age band">
              <SelectValue placeholder="All age bands" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="0-9">0–9</SelectItem>
              <SelectItem value="10-14">10–14</SelectItem>
              <SelectItem value="15-17">15–17</SelectItem>
              <SelectItem value="18-24">18–24</SelectItem>
              <SelectItem value="25+">25+</SelectItem>
              <SelectItem value="Unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Disability status</span>
          <Select
            value={filters.disabilityStatus ?? 'ALL'}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                disabilityStatus:
                  value === 'ALL' ? undefined : (value as BeneficiaryFilters['disabilityStatus']),
              })
            }
          >
            <SelectTrigger aria-label="Disability status">
              <SelectValue placeholder="All disability values" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="WITH_DISABILITY">With disability</SelectItem>
              <SelectItem value="WITHOUT_DISABILITY">Without disability</SelectItem>
              <SelectItem value="NOT_SPECIFIED">Not specified</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Enrollment status</span>
          <Select
            value={filters.enrollmentStatus ?? 'ALL'}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                enrollmentStatus:
                  value === 'ALL' ? undefined : (value as BeneficiaryFilters['enrollmentStatus']),
              })
            }
          >
            <SelectTrigger aria-label="Enrollment status">
              <SelectValue placeholder="All enrollment states" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="EXITED">Exited</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {loadingRecords ? (
          <p className="p-8 text-center text-sm text-muted-foreground" aria-live="polite">
            Loading authorized project records...
          </p>
        ) : recordsFailed ? (
          <p role="alert" className="p-8 text-center text-sm text-destructive">
            Beneficiary records could not be verified. Check access and retry.
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
