'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useLayoutEffect, useRef } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, ConfirmationDialog, StatusBadge } from '@/components/pathways'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  IMPORT_DUPLICATE_DECISION_UI_ENABLED,
  UNFINISHED_CONTROLS_UI_ENABLED,
} from '@/constants/feature-flags'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { cn } from '@/lib/utils'

import { dataTypeLabels } from '../../collection.utils'
import { ImportProcessingPanel } from '../../import/components/import-processing-panel'
import { ImportView } from '../../import/components/import-view'
import { CORRECTION_PAGE_SIZE, type CollectionWorkspaceProps, modeDetails } from '../forms.utils'
import { useCollectionEdits } from '../hooks/use-collection-edits'
import { useCollectionGuard } from '../hooks/use-collection-guard'
import { useCollectionLoading } from '../hooks/use-collection-loading'
import { useCollectionState } from '../hooks/use-collection-state'
import { useFormActions } from '../hooks/use-form-actions'
import { useImportActions } from '../hooks/use-import-actions'
import { BuilderView } from './builder-view'
import { FormsGeneratorView } from './forms-generator-view'

export const CollectionWorkspace = (props: CollectionWorkspaceProps) => {
  const { profile } = useCurrentRole()
  const identity =
    profile?.userId && profile.organizationId
      ? JSON.stringify([
          profile.userId,
          profile.organizationId,
          [...profile.roles].sort(),
          [...profile.permissions].sort(),
          [...profile.assignedProjectIds].sort(),
          props.initialProjectId,
          props.initialFormId,
        ])
      : null
  const latestOwner = useRef(identity)
  latestOwner.current = identity
  const alive = useRef(true)
  // A layout effect, so React's development StrictMode remount re-arms this flag before the
  // owned child's passive effects re-run. As a passive effect it ran after them, so the child's
  // mount-time ownership check saw a dead owner and skipped loading the project list.
  useLayoutEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const isCurrentOwner = useCallback(
    () => alive.current && latestOwner.current === identity,
    [identity],
  )
  if (!identity) return <output>Current collection access is required.</output>
  return <OwnedCollectionWorkspace key={identity} {...props} isCurrentOwner={isCurrentOwner} />
}
const OwnedCollectionWorkspace = (
  props: CollectionWorkspaceProps & { isCurrentOwner: () => boolean },
) => {
  const { labels } = useDisplayLabels()
  const state = useCollectionState(props)
  const guard = useCollectionGuard(state)
  useCollectionLoading(state, guard)
  const edits = useCollectionEdits(state)
  const formActions = useFormActions(state, guard)
  const importActions = useImportActions(state, guard)
  const {
    activities,
    addField,
    confirmDeleteField,
    correctionPage,
    createPending,
    creatingVersion,
    duplicateDecision,
    editingFormId,
    fields,
    formCreate,
    formTitle,
    formType,
    forms,
    formsLoaded,
    importMessage,
    importStatus,
    intent,
    journeyStage,
    linkedActivityId,
    loadError,
    mappingRows,
    mode,
    moveField,
    mutation,
    operationPending,
    parsedImport,
    pendingDeleteField,
    proceedDialogOpen,
    profile,
    projectId,
    projects,
    projectsLoaded,
    requestDeleteField,
    saveDialogOpen,
    selectedFieldId,
    setCorrectionPage,
    setDuplicateDecision,
    setFormTitle,
    setFormType,
    setJourneyStage,
    setLinkedActivityId,
    setLoadError,
    setMappingRows,
    setMode,
    setPendingDeleteField,
    setProceedDialogOpen,
    setReloadKey,
    setSaveDialogOpen,
    setSelectedFieldId,
    setView,
    updateField,
    uploadProgress,
    view,
  } = state
  const {
    canGenerateForms,
    canManageForms,
    canOpenForms,
    canOpenImport,
    canPublishForms,
    canUseExtend,
    editingReady,
    eligible,
  } = guard
  const {
    changeInput,
    changeProject,
    openBuilder,
    openSavedForm,
    savedForms,
    startNewForm,
    updateCorrectionCell,
  } = edits
  const { createNewVersion, downloadSavedForm, generateCopy, publishFormToApi, saveDraftToApi } =
    formActions
  const {
    closeProceedDialog,
    confirmImportProceed,
    importCanProceed,
    importSummary,
    mappingReadiness,
    parseSelectedFile,
    processingRun,
    resumeServerProcessing,
    retrySelectedFile,
    stopServerProcessing,
  } = importActions
  const selectedProject = projects.find((project) => project.id === projectId)
  const projectActivities = activities.filter((activity) => activity.projectId === projectId)
  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? fields[0]

  const mappedCount = fields.filter((field) => field.mappingStatus === 'mapped').length
  const sadddCount = fields.filter((field) => field.sadddField).length
  const metadataCount = fields.filter((field) => field.metadataKey).length
  const metadataCoverage = fields.length === 0 ? 0 : Math.round((mappedCount / fields.length) * 100)
  const visibleModes = modeDetails.filter((item) => {
    if (item.id === 'scratch') return canManageForms
    if (item.id === 'import') return canOpenImport
    return canUseExtend
  })
  const canReadProjects = principalHasAtomicPermission(profile, 'projects.read')
  // Without a selected project the list waits on the project load, unless projects cannot be read.
  const formsLoading = projectId ? !formsLoaded : !projectsLoaded && canReadProjects
  const loadErrorState = loadError ? (
    <AsyncState
      status="error"
      title="Collection data could not be loaded"
      description={loadError}
      onRetry={() => {
        setLoadError('')
        setReloadKey((key) => key + 1)
      }}
    />
  ) : null
  return (
    <fieldset disabled={operationPending} className="space-y-6">
      <PageHeader
        editableLabelKey="moduleCollection"
        title={labels.moduleCollection}
        actions={
          canOpenForms ? (
            <Button asChild>
              <Link href="/collection/forms">Forms</Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {visibleModes.map((item) => (
          <Link
            key={item.id}
            className={cn(
              'rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              mode === item.id && 'border-primary bg-primary-subtle',
            )}
            href={item.href}
            onClick={() => openBuilder(item.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
              </div>
              {mode === item.id ? <StatusBadge tone="info">Selected</StatusBadge> : null}
            </div>
          </Link>
        ))}
      </div>

      {loadError && view !== 'forms' && view !== 'home' ? loadErrorState : null}

      {view === 'forms' || view === 'home' ? (
        <FormsGeneratorView
          canCreate={canManageForms}
          canImport={canOpenImport}
          onOpen={openSavedForm}
          onCreate={startNewForm}
          onDownload={downloadSavedForm}
          savedForms={savedForms}
          status={formsLoading ? 'loading' : loadError ? 'error' : 'ready'}
          errorState={loadErrorState}
        />
      ) : null}

      {view === 'builder' &&
        canManageForms &&
        forms.find((form) => form.id === editingFormId)?.status === 'PUBLISHED' && (
          <Button
            type="button"
            variant="outline"
            disabled={creatingVersion}
            onClick={createNewVersion}
          >
            Create new version
          </Button>
        )}
      {view === 'builder' &&
        canGenerateForms &&
        forms.some((form) => form.id === editingFormId) && (
          <Button type="button" variant="outline" disabled={creatingVersion} onClick={generateCopy}>
            Generate copy
          </Button>
        )}
      {view === 'builder' ? (
        <>
          {!editingReady && (
            <output className="block rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">
              The saved form is not ready. Wait for it to load, or return to Forms if it is
              unavailable.
            </output>
          )}
          <fieldset
            disabled={
              !canManageForms ||
              !editingReady ||
              forms.find((f) => f.id === editingFormId)?.status === 'PUBLISHED'
            }
            className="space-y-4"
          >
            <BuilderView
              addField={addField}
              canManage={canManageForms}
              canPublish={
                canPublishForms &&
                forms.find((form) => form.id === editingFormId)?.status === 'DRAFT' &&
                !forms.find((form) => form.id === editingFormId)?.createdByCurrentUser
              }
              deleteField={requestDeleteField}
              fields={fields}
              formTitle={formTitle}
              formType={formType}
              journeyStage={journeyStage}
              linkedActivityId={linkedActivityId}
              metadataCount={metadataCount}
              metadataCoverage={metadataCoverage}
              mappedCount={mappedCount}
              mode={mode}
              moveField={moveField}
              onPublish={() => void publishFormToApi()}
              projectActivities={projectActivities}
              projects={projects}
              projectsLoaded={projectsLoaded}
              projectId={projectId}
              sadddCount={sadddCount}
              selectedField={selectedField}
              selectedFieldId={selectedFieldId}
              selectedProject={selectedProject?.title ?? 'No project selected'}
              setFormTitle={changeInput(setFormTitle)}
              setFormType={changeInput(setFormType)}
              setJourneyStage={changeInput(setJourneyStage)}
              setLinkedActivityId={changeInput(setLinkedActivityId)}
              setProjectId={changeProject}
              setSaveDialogOpen={setSaveDialogOpen}
              setSelectedFieldId={setSelectedFieldId}
              updateField={updateField}
            />
          </fieldset>
        </>
      ) : null}

      {view === 'import' ? (
        <div className="space-y-4">
          {UNFINISHED_CONTROLS_UI_ENABLED && IMPORT_DUPLICATE_DECISION_UI_ENABLED ? (
            <div className="space-y-2">
              <Label htmlFor="duplicate-decision">Duplicate records decision</Label>
              <Select
                value={duplicateDecision}
                onValueChange={(value) => {
                  if (mutation.current) return
                  intent.current++
                  setDuplicateDecision(value as 'pending' | 'skip' | 'keep')
                }}
              >
                <SelectTrigger id="duplicate-decision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Decide when duplicates are flagged</SelectItem>
                  <SelectItem disabled title="Not available yet" value="skip">
                    Skip duplicates (not available yet)
                  </SelectItem>
                  <SelectItem disabled title="Not available yet" value="keep">
                    Keep confirmed duplicates (not available yet)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {parsedImport?.rows.length
            ? (() => {
                const totalRows = parsedImport.rows.length
                const totalPages = Math.max(1, Math.ceil(totalRows / CORRECTION_PAGE_SIZE))
                const page = Math.min(correctionPage, totalPages - 1)
                const pageStart = page * CORRECTION_PAGE_SIZE
                const pageEnd = Math.min(pageStart + CORRECTION_PAGE_SIZE, totalRows)
                const pageRows = parsedImport.rows.slice(pageStart, pageEnd)
                return (
                  <details className="min-w-0">
                    <summary>Correct isolated data before reprocessing</summary>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {totalPages > 1 ? (
                        <output aria-live="polite" className="text-xs text-muted-foreground">
                          Rows {pageStart + 1}-{pageEnd} of {totalRows}
                        </output>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Rows {pageStart + 1}-{pageEnd} of {totalRows}
                        </p>
                      )}
                      {totalPages > 1 ? (
                        <div className="flex gap-2">
                          <Button
                            className="min-h-11"
                            disabled={page === 0}
                            onClick={() => setCorrectionPage((current) => Math.max(0, current - 1))}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Previous
                          </Button>
                          <Button
                            className="min-h-11"
                            disabled={pageEnd >= totalRows}
                            onClick={() => setCorrectionPage((current) => current + 1)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Next
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <section
                      aria-label="Isolated data rows awaiting correction"
                      className="mt-2 max-w-full overflow-x-auto rounded-lg border border-border"
                      // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
                      tabIndex={0}
                    >
                      <table className="min-w-max text-sm">
                        <TableBody>
                          {pageRows.map((row, relativeIndex) => {
                            const rowIndex = pageStart + relativeIndex
                            return (
                              <TableRow className="h-14" key={rowIndex}>
                                {parsedImport.headers.map((column) => {
                                  const cellValue = String(row[column] ?? '')
                                  return (
                                    <TableCell key={column}>
                                      <Input
                                        aria-label={`Row ${rowIndex + 1}: ${column}`}
                                        className="max-w-[220px] truncate"
                                        title={cellValue}
                                        value={cellValue}
                                        onChange={(event) =>
                                          updateCorrectionCell(rowIndex, column, event.target.value)
                                        }
                                      />
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </table>
                    </section>
                  </details>
                )
              })()
            : null}
          <ImportView
            fields={fields}
            formTitle={formTitle}
            formType={formType}
            importCanProceed={importCanProceed}
            importMessage={importMessage}
            importStatus={importStatus}
            importSummary={importSummary}
            journeyStage={journeyStage}
            linkedActivityId={linkedActivityId}
            mappingRows={mappingRows}
            mappingReadiness={mappingReadiness}
            mode={mode}
            parsedImport={parsedImport}
            parseSelectedFile={parseSelectedFile}
            sourceFileEnabled={Boolean(
              projectId &&
                editingReady &&
                eligible('imports.read') &&
                projects.some((project) => project.id === projectId),
            )}
            projectActivities={projectActivities}
            projects={projects}
            projectsLoaded={projectsLoaded}
            projectId={projectId}
            selectedProject={selectedProject?.title ?? 'No project selected'}
            setFormTitle={changeInput(setFormTitle)}
            setFormType={changeInput(setFormType)}
            setJourneyStage={changeInput(setJourneyStage)}
            setLinkedActivityId={changeInput(setLinkedActivityId)}
            setMappingRows={(next) => {
              if (mutation.current) return
              intent.current++
              setMappingRows(next)
            }}
            setMode={changeInput(setMode)}
            setProceedDialogOpen={setProceedDialogOpen}
            setProjectId={changeProject}
            setView={changeInput(setView)}
            retrySelectedFile={retrySelectedFile}
            uploadProgress={uploadProgress}
          />
        </div>
      ) : null}

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          if (!mutation.current) setSaveDialogOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save form draft?</DialogTitle>
            <DialogDescription>
              This saves the validated definition as a Draft. Publishing remains a separate,
              permission-controlled action.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-surface-subtle p-4 text-sm">
            <p className="font-medium text-foreground">{formTitle}</p>
            <p className="mt-1 text-muted-foreground">
              {fields.length} fields, {mappedCount} mapped, {sadddCount} SADDD fields.
            </p>
          </div>
          {formCreate.notice ? (
            <output className="block text-sm text-info">{formCreate.notice}</output>
          ) : null}
          <DialogFooter>
            <Button
              disabled={operationPending}
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={operationPending || createPending}
              onClick={() => void saveDraftToApi()}
            >
              {operationPending || createPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {operationPending || createPending ? 'Saving...' : 'Save draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={proceedDialogOpen}
        onOpenChange={(open) => {
          if (mutation.current) return
          if (open) setProceedDialogOpen(true)
          else closeProceedDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {parsedImport?.rows.length === 0 ? 'Create draft form?' : 'Review mapped fields?'}
            </DialogTitle>
            <DialogDescription>
              {parsedImport?.rows.length === 0
                ? 'The mapped columns will become questionnaire fields. You can edit the Draft from Forms before publishing.'
                : 'Valid rows will be imported; invalid rows remain isolated for correction and reprocessing.'}
            </DialogDescription>
          </DialogHeader>
          {processingRun ? (
            <ImportProcessingPanel
              canResume={!operationPending}
              focusOnMount
              note={processingRun.note}
              onResume={() => void resumeServerProcessing()}
              onStop={stopServerProcessing}
              progress={processingRun.progress}
              state={processingRun.state}
            />
          ) : null}
          <DialogFooter>
            <Button disabled={operationPending} variant="outline" onClick={closeProceedDialog}>
              {processingRun ? 'Close' : 'Cancel'}
            </Button>
            {processingRun ? null : (
              <Button
                className="gap-2"
                disabled={operationPending || createPending}
                onClick={confirmImportProceed}
              >
                {operationPending || createPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {operationPending || createPending
                  ? 'Working...'
                  : parsedImport?.rows.length === 0
                    ? 'Create draft'
                    : 'Proceed'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        confirmLabel={`Delete ${pendingDeleteField?.label ?? 'field'}`}
        description="This removes the field and its current configuration from the form."
        onConfirm={confirmDeleteField}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteField(null)
          }
        }}
        open={Boolean(pendingDeleteField)}
        title={`Delete ${pendingDeleteField?.label ?? 'this field'}?`}
      >
        {pendingDeleteField ? (
          <div className="rounded-md border border-border bg-surface-subtle p-3 text-sm">
            <p className="font-medium text-foreground">{pendingDeleteField.label}</p>
            <p className="mt-1 text-muted-foreground">
              Field code: {pendingDeleteField.code} · Type:{' '}
              {dataTypeLabels[pendingDeleteField.type]}
            </p>
          </div>
        ) : null}
      </ConfirmationDialog>
    </fieldset>
  )
}
