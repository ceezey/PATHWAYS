'use client'

import { Database, FileSpreadsheet, ListPlus, Plus } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { EmptyState, LoadingSkeleton, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { type SavedForm, formatSavedAt, savedFormStatus } from '../../collection.utils'

// Groups the forms under their project, in the order the projects were loaded.
const groupByProject = (forms: SavedForm[]) => {
  const groups = new Map<string, SavedForm[]>()
  for (const form of forms)
    groups.set(form.projectId, [...(groups.get(form.projectId) ?? []), form])
  return [...groups.values()]
}

export const FormsGeneratorView = ({
  canCreate,
  canImport,
  errorState,
  onOpen,
  onCreate,
  onDownload,
  savedForms,
  status,
}: {
  canCreate: boolean
  canImport: boolean
  errorState: ReactNode
  onOpen: (form: SavedForm) => void
  onCreate: () => void
  onDownload: (form: SavedForm) => void
  savedForms: SavedForm[]
  status: 'loading' | 'error' | 'ready'
}) => (
  <SectionCard
    title="Collection forms"
    description="Form generator"
    actions={
      canCreate || canImport ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add new
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {canCreate ? (
              <DropdownMenuItem onClick={onCreate}>
                <ListPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Create new
              </DropdownMenuItem>
            ) : null}
            {canImport ? (
              <DropdownMenuItem asChild>
                <Link href="/collection/import">
                  <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
                  Import file
                </Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null
    }
  >
    {status === 'loading' ? (
      <LoadingSkeleton lines={3} />
    ) : status === 'error' ? (
      errorState
    ) : savedForms.length === 0 ? (
      <EmptyState
        icon={Database}
        title="None yet"
        description="No collection forms are saved for your projects yet."
      />
    ) : (
      <div className="space-y-6">
        {groupByProject(savedForms).map((projectForms) => (
          <section key={projectForms[0].projectId} className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{projectForms[0].project}</h3>
            <ul className="space-y-3">
              {projectForms.map((form) => {
                const display = savedFormStatus[form.type] ?? { label: form.type, tone: 'neutral' }
                return (
                  <li
                    key={form.id}
                    className="flex min-h-[52px] flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary"
                      >
                        <Database className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">{form.title}</p>
                          <StatusBadge dot={false} tone={display.tone}>
                            {display.label}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.fieldCount} {form.fieldCount === 1 ? 'field' : 'fields'} · Saved{' '}
                          {formatSavedAt(form.savedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => onOpen(form)}>
                        Open form
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onDownload(form)}>
                        Export form
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    )}
  </SectionCard>
)
