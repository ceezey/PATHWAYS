'use client'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { BeneficiaryRecord } from '@/types/pathways'
import { useState } from 'react'

export function EvaluationCenterLookup() {
  const { role } = useCurrentRole()
  const [code, setCode] = useState('')
  const [searched, setSearched] = useState(false)
  const [beneficiary, setBeneficiary] = useState<BeneficiaryRecord | undefined>()
  const [error, setError] = useState('')
  const search = async () => {
    if (!role) return
    setSearched(false)
    setError('')
    try {
      const projects = await pathwaysClient.getProjectsForRole(role)
      const records = await Promise.all(
        projects.map((project) =>
          pathwaysClient.getBeneficiaryRecordsForRole(role, project.id, { search: code.trim() }),
        ),
      )
      setBeneficiary(
        records.flat().find((record) => record.code.toLowerCase() === code.trim().toLowerCase()),
      )
      setSearched(true)
    } catch (caught) {
      setBeneficiary(undefined)
      setError(caught instanceof Error ? caught.message : 'Beneficiary lookup is unavailable.')
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evaluation Center"
        title="Beneficiary code lookup"
        description="The short-lived PIN check is completed before any personal details are loaded."
      />
      <SectionCard
        title="Find a beneficiary"
        description="Enter an exact beneficiary code within your authorized projects."
      >
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            void search()
          }}
        >
          <Input
            aria-label="Beneficiary code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              setSearched(false)
            }}
            placeholder="BEN-NCR-001"
          />
          <Button type="submit" disabled={!role}>
            Search by code
          </Button>
        </form>
      </SectionCard>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {beneficiary ? (
        <SectionCard title={beneficiary.displayName} description="Scoped evaluation-center profile">
          <div className="grid gap-4 sm:grid-cols-3">
            <p>
              <span className="text-muted-foreground">Code</span>
              <br />
              {beneficiary.code}
            </p>
            <p>
              <span className="text-muted-foreground">Location</span>
              <br />
              {beneficiary.location}
            </p>
            <p>
              <span className="text-muted-foreground">Journey entries</span>
              <br />
              {beneficiary.participation.length}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <StatusBadge tone="info">{beneficiary.sex}</StatusBadge>
            <StatusBadge tone="neutral">{beneficiary.ageGroup}</StatusBadge>
            <StatusBadge tone="neutral">{beneficiary.disabilityStatus}</StatusBadge>
          </div>
        </SectionCard>
      ) : searched ? (
        <EmptyState
          title="No scoped beneficiary found"
          description="Check the exact code. Records outside your assigned projects remain hidden."
        />
      ) : null}
    </div>
  )
}
