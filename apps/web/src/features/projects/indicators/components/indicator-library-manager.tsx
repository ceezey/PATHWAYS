'use client'

import { ArrowLeft, LibraryBig } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  ConfirmationDialog,
  EmptyState,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { stickyTableHeadClass } from '@/components/pathways/sticky-table-head'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { PathwaysClientError } from '@/lib/api/core/request'
import { indicatorLibraryClient } from '@/lib/api/indicators'
import { fingerprintOf } from '@/lib/forms/pending-create'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { IndicatorLibraryEntryResponse } from '@pathways/shared'
import { InlineNotice } from '../../components/option-select'
import { recipeNames } from '../indicators.copy'
import { useIndicatorLibraryRead } from '../indicators.reads'
import { NewEntry } from './library-entry-form'

export function IndicatorLibraryManager() {
  const { profile } = useCurrentRole()
  // Returns to the project that opened the library, otherwise to the indicators overview.
  const fromProject = useSearchParams().get('project')
  const backHref =
    fromProject && /^[0-9a-f-]{36}$/i.test(fromProject)
      ? `/projects/${fromProject}/indicators`
      : '/indicators'
  const canCreate = principalHasAtomicPermission(profile, 'indicators.library.create')
  const canArchive = principalHasAtomicPermission(profile, 'indicators.library.archive')
  const read = useIndicatorLibraryRead()
  const [message, setMessage] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<IndicatorLibraryEntryResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const pendingCreate = usePendingCreate<IndicatorLibraryEntryResponse>({
    profile,
    kind: 'indicator-library-entry',
    successMessage: 'Library entry saved',
    findCreated: async (fingerprint) =>
      (await indicatorLibraryClient.list()).find(
        (entry) => fingerprintOf(entry.code) === fingerprint,
      ),
    onConfirmed: () => void read.refetch(),
  })
  const run = async (action: () => Promise<unknown>, done: string, createFingerprint?: string) => {
    if (busy) return false
    setBusy(true)
    setMessage(null)
    try {
      if (createFingerprint) {
        if (!(await pendingCreate.submit(createFingerprint, action))) return false
      } else await action()
      setMessage(done)
      void read.refetch()
      return true
    } catch (failure) {
      setMessage(
        failure instanceof PathwaysClientError
          ? failure.message
          : 'The change could not be confirmed. Reload and try again.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  const entries = read.data
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Indicator library"
        description="Reusable indicator definitions for your organization. Using one copies its definition into a project; it never links back."
        actions={
          <Button asChild className="gap-2" variant="outline">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Indicators
            </Link>
          </Button>
        }
      />
      {canCreate ? (
        <div className="flex justify-end">
          <NewEntry
            busy={busy || pendingCreate.pending}
            message={message ?? pendingCreate.notice}
            onCreate={(input) =>
              run(
                () => indicatorLibraryClient.create(input),
                'Library entry saved.',
                fingerprintOf(input.code),
              )
            }
          />
        </div>
      ) : null}
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      {read.error ? (
        <AsyncState
          status="error"
          title="Library unavailable"
          description="The library could not be loaded. Reload the page to try again."
          onRetry={() => void read.refetch()}
        />
      ) : !entries ? (
        <AsyncState
          status="loading"
          title="Loading the indicator library"
          description="Verifying current access."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title="No library entries yet"
          description="Add a definition once, then reuse it in any project of your organization."
        />
      ) : (
        <SectionCard
          title="Library entries"
          description={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · definitions only, never linked back to projects`}
        >
          <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  <th className={stickyTableHeadClass}>Code</th>
                  <th className={stickyTableHeadClass}>Entry</th>
                  <th className={stickyTableHeadClass}>Authority</th>
                  <th className={stickyTableHeadClass}>Domain and direction</th>
                  <th className={stickyTableHeadClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    aria-label={`Library entry: ${entry.name}`}
                    className="border-b border-border align-top last:border-0 hover:bg-muted"
                    key={entry.id}
                  >
                    <td className="px-4 py-3 text-muted-foreground">{entry.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.unitLabel} · Source: {entry.dataSource}
                      </p>
                      {entry.description ? (
                        <p className="mt-1 text-sm">{entry.description}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone="neutral">
                        {entry.recipe ? recipeNames[entry.recipe] : 'Manual measurement'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.numericKind.replaceAll('_', ' ')} ·{' '}
                      {entry.direction.replaceAll('_', ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canArchive ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setArchiving(entry)}
                        >
                          Archive entry
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      <ConfirmationDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archive library entry"
        description={`Archive ${archiving?.code ?? 'this entry'}? It is hidden from the library. Project indicators already created from it are not changed.`}
        confirmLabel="Archive entry"
        onConfirm={() => {
          const target = archiving
          setArchiving(null)
          if (target)
            void run(() => indicatorLibraryClient.archive(target.id), 'Library entry archived.')
        }}
      />
    </section>
  )
}
