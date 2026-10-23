'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'

import { useBatchIntake } from '../hooks/use-batch-intake'
import { useBatchProcessing } from '../hooks/use-batch-processing'
import { useBatchReview } from '../hooks/use-batch-review'
import { useImportLoading } from '../hooks/use-import-loading'
import { useImportState } from '../hooks/use-import-state'
import { ImportBatchList } from './import-batch-list'
import { ImportBatchSummary } from './import-batch-summary'
import { ImportMappingCard } from './import-mapping-card'
import { ImportOpenDraft } from './import-open-draft'
import { ImportProcessingPanel } from './import-processing-panel'
import { ImportRowsCard } from './import-rows-card'
import { ImportUploadCard } from './import-upload-card'

export function ImportWorkspace() {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(profile, 'import-workspace', 'imports.read', null, null)
  if (!scope) return <output>Current import access is required.</output>
  // Sorted so a permission/assignment grant that is re-fetched with the same entries in a
  // different order (e.g. after a token refresh) does not read as a changed key and force
  // an unnecessary remount that would drop the workspace's in-progress project selection.
  const accessKey = JSON.stringify([
    [...(profile?.roles ?? [])].sort(),
    [...(profile?.permissions ?? [])].sort(),
    [...(profile?.assignedProjectIds ?? [])].sort(),
  ])
  return <OwnedImportWorkspace key={scope.key + scope.generation + accessKey} scope={scope} />
}
function OwnedImportWorkspace({ scope }: { scope: SensitiveDraftOwner }) {
  const { labels } = useDisplayLabels()
  const state = useImportState(scope)
  useImportLoading(state)
  const review = useBatchReview(state)
  const run = useBatchProcessing(state, review)
  const intake = useBatchIntake(state, review, run)
  const {
    batch,
    canOpenForms,
    canProcess,
    draftTarget,
    loadState,
    pending,
    setLoadAttempt,
    setLoadState,
    sourceColumns,
  } = state
  const { process, stopProcessing, visibleProcessing } = run
  return (
    <div className="space-y-6">
      <PageHeader
        editableLabelKey="moduleCollection"
        title={labels.moduleCollection}
        description="Upload a private CSV, workbook or text-based PDF, review field mappings, validate every row, and promote only valid generic submissions."
        actions={
          canOpenForms ? (
            <Button asChild variant="outline">
              <Link href="/collection/forms">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Forms
              </Link>
            </Button>
          ) : undefined
        }
      />

      {draftTarget ? <ImportOpenDraft target={draftTarget} /> : null}

      {visibleProcessing ? (
        // Outside the disabled fieldset so Stop stays available while processing runs.
        <ImportProcessingPanel
          canResume={canProcess && !pending}
          focusOnMount
          note={visibleProcessing.note}
          onResume={() => void process()}
          onStop={stopProcessing}
          progress={visibleProcessing.progress}
          state={visibleProcessing.state}
        />
      ) : null}

      <fieldset disabled={pending} className="space-y-6">
        {loadState !== 'ready' ? (
          <AsyncState
            status={loadState}
            title={
              loadState === 'loading'
                ? 'Loading authorized projects'
                : 'Authorized projects could not be loaded'
            }
            description={
              loadState === 'loading'
                ? 'Projects you can import into will appear here.'
                : 'Check your connection and access, then try again.'
            }
            onRetry={() => {
              setLoadState('loading')
              setLoadAttempt((current) => current + 1)
            }}
          />
        ) : null}

        <ImportUploadCard state={state} review={review} />

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <ImportBatchList state={state} review={review} />

          <div className="space-y-4">
            {!batch ? (
              <EmptyState
                title="No import selected"
                description="Select a persisted import batch to map, validate, review, or resume."
              />
            ) : (
              <>
                <ImportBatchSummary
                  review={review}
                  intake={intake}
                  pending={pending}
                  batch={batch}
                />

                {sourceColumns.length > 0 ? (
                  <ImportMappingCard
                    state={state}
                    review={review}
                    run={run}
                    intake={intake}
                    batch={batch}
                  />
                ) : null}

                <ImportRowsCard state={state} />
              </>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  )
}
