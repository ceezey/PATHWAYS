'use client'

import Link from 'next/link'
import { useCallback, useLayoutEffect, useRef } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  IMPORT_DUPLICATE_DECISION_UI_ENABLED,
  UNFINISHED_CONTROLS_UI_ENABLED,
} from '@/constants/feature-flags'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { cn } from '@/lib/utils'

import { ImportView } from '../../import/components/import-view'
import { type CollectionWorkspaceProps, modeDetails } from '../forms.utils'
import { useCollectionEdits } from '../hooks/use-collection-edits'
import { useCollectionGuard } from '../hooks/use-collection-guard'
import { useCollectionLoading } from '../hooks/use-collection-loading'
import { useCollectionState } from '../hooks/use-collection-state'
import { useFormActions } from '../hooks/use-form-actions'
import { useImportActions } from '../hooks/use-import-actions'
import { BuilderView } from './builder-view'
import { CorrectionTable } from './correction-table'
import { DeleteFieldDialog } from './delete-field-dialog'
import { DuplicateDecision } from './duplicate-decision'
import { FormsGeneratorView } from './forms-generator-view'
import { ProceedDialog } from './proceed-dialog'
import { SaveDraftDialog } from './save-draft-dialog'

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
    creatingVersion,
    editingFormId,
    fields,
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
    profile,
    projectId,
    projects,
    projectsLoaded,
    requestDeleteField,
    selectedFieldId,
    setFormTitle,
    setFormType,
    setJourneyStage,
    setLinkedActivityId,
    setLoadError,
    setMappingRows,
    setMode,
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
  const { changeInput, changeProject, openBuilder, openSavedForm, savedForms, startNewForm } = edits
  const { createNewVersion, downloadSavedForm, generateCopy, publishFormToApi } = formActions
  const {
    importCanProceed,
    importSummary,
    mappingReadiness,
    parseSelectedFile,
    retrySelectedFile,
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
            <DuplicateDecision state={state} />
          ) : null}
          {parsedImport?.rows.length ? (
            <CorrectionTable state={state} edits={edits} parsedImport={parsedImport} />
          ) : null}
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

      <SaveDraftDialog
        state={state}
        formActions={formActions}
        mappedCount={mappedCount}
        sadddCount={sadddCount}
      />

      <ProceedDialog state={state} importActions={importActions} />

      <DeleteFieldDialog state={state} />
    </fieldset>
  )
}
