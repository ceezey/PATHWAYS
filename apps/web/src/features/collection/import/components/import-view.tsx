'use client'

import { FileUp } from 'lucide-react'

import type { createFileSummary } from '@pathways/imports'

import { ProgressBar, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ActivitySummary, ProjectSummary } from '@/types/pathways'

import type {
  CollectionMode,
  CollectionView,
  FormField,
  ImportStatus,
  ParsedImport,
} from '../../collection.utils'
import { FormInfoPanel } from '../../forms/components/form-info-panel'
import type { MappingReadiness, MappingRow } from '../collection-import-state'
import { DataPreview } from './data-preview'
import { ImportValidationPanel } from './import-validation-panel'
import { MappingTable } from './mapping-table'
import { SummaryMetric } from './summary-metric'

export const ImportView = ({
  fields,
  formTitle,
  formType,
  importCanProceed,
  importMessage,
  importStatus,
  importSummary,
  journeyStage,
  linkedActivityId,
  mappingRows,
  mappingReadiness,
  mode,
  parsedImport,
  parseSelectedFile,
  sourceFileEnabled,
  projectActivities,
  projects,
  projectsLoaded,
  projectId,
  selectedProject,
  setFormTitle,
  setFormType,
  setJourneyStage,
  setLinkedActivityId,
  setMappingRows,
  setMode,
  setProceedDialogOpen,
  setProjectId,
  setView,
  retrySelectedFile,
  uploadProgress,
}: {
  fields: FormField[]
  formTitle: string
  formType: string
  importCanProceed: boolean
  importMessage: string
  importStatus: ImportStatus
  importSummary: ReturnType<typeof createFileSummary> | null
  journeyStage: string
  linkedActivityId: string
  mappingRows: MappingRow[]
  mappingReadiness: MappingReadiness
  mode: CollectionMode
  parsedImport: ParsedImport | null
  parseSelectedFile: (file: File) => Promise<void>
  sourceFileEnabled: boolean
  projectActivities: ActivitySummary[]
  projects: ProjectSummary[]
  projectsLoaded: boolean
  projectId: string
  selectedProject: string
  setFormTitle: (value: string) => void
  setFormType: (value: string) => void
  setJourneyStage: (value: string) => void
  setLinkedActivityId: (value: string) => void
  setMappingRows: React.Dispatch<React.SetStateAction<MappingRow[]>>
  setMode: (mode: CollectionMode) => void
  setProceedDialogOpen: (open: boolean) => void
  setProjectId: (value: string) => void
  setView: (view: CollectionView) => void
  retrySelectedFile: () => void
  uploadProgress: number
}) => (
  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-4">
      <FormInfoPanel
        formTitle={formTitle}
        formType={formType}
        journeyStage={journeyStage}
        linkedActivityId={linkedActivityId}
        projectActivities={projectActivities}
        projects={projects}
        projectsLoaded={projectsLoaded}
        projectId={projectId}
        setFormTitle={setFormTitle}
        setFormType={setFormType}
        setJourneyStage={setJourneyStage}
        setLinkedActivityId={setLinkedActivityId}
        setProjectId={setProjectId}
      />

      <SectionCard
        title="Upload your existing form file"
        description="Select a CSV, XLS, or XLSX file to review and map its columns before import."
      >
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed bg-surface-subtle px-4 py-8 text-center">
          <FileUp className="h-8 w-8 text-primary" aria-hidden="true" />
          <div className="mt-4 w-full max-w-xl space-y-2 text-left">
            <Label htmlFor="collection-import-file">Source file</Label>
            <Input
              disabled={!sourceFileEnabled}
              accept=".csv,.xls,.xlsx"
              aria-describedby="collection-import-file-help"
              id="collection-import-file"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]

                if (file) {
                  void parseSelectedFile(file)
                }
              }}
            />
            <p className="text-xs leading-5 text-muted-foreground" id="collection-import-file-help">
              Choose one CSV, XLS, or XLSX file.
              {!sourceFileEnabled
                ? ' Project and selected form access must be ready before choosing a file.'
                : null}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMode('scratch')
                setView('builder')
              }}
            >
              Build forms
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <ProgressBar
            label="File reading progress"
            tone={
              importStatus === 'error' ? 'danger' : importStatus === 'ready' ? 'success' : 'info'
            }
            value={uploadProgress}
          />
          <output
            aria-atomic="true"
            aria-live="polite"
            className={cn(
              'block rounded-md px-3 py-2 text-sm',
              importStatus === 'error'
                ? 'bg-danger-subtle font-medium text-danger'
                : 'bg-surface-subtle text-muted-foreground',
            )}
            data-import-status={importStatus}
          >
            {importMessage}
          </output>
          {importStatus === 'error' ? (
            <Button size="sm" type="button" variant="outline" onClick={retrySelectedFile}>
              Retry reading file
            </Button>
          ) : null}
        </div>
      </SectionCard>

      {importSummary ? (
        <Card>
          <CardContent className="pt-5">
            <div className="grid gap-4 md:grid-cols-3">
              <SummaryMetric label="File" value={importSummary.fileName} />
              <SummaryMetric label="Rows" value={String(importSummary.totalRows)} />
              <SummaryMetric label="Columns" value={String(importSummary.totalColumns)} />
            </div>
            {parsedImport?.sheetNames?.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Sheets detected: {parsedImport.sheetNames.join(', ')}
              </p>
            ) : null}
            {importSummary.warnings.length > 0 ? (
              <div className="mt-3 rounded-md bg-warning-subtle p-3 text-xs text-warning">
                {importSummary.warnings.join(' ')}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {mappingRows.length > 0 ? (
        <MappingTable
          canProceed={importCanProceed}
          createsDraft={parsedImport?.rows.length === 0}
          fields={fields}
          mappingRows={mappingRows}
          mappingReadiness={mappingReadiness}
          setMappingRows={setMappingRows}
          setProceedDialogOpen={setProceedDialogOpen}
          setView={setView}
          mode={mode}
        />
      ) : null}

      {parsedImport ? <DataPreview parsedImport={parsedImport} /> : null}
    </div>

    <aside className="min-w-0 space-y-4">
      <ImportValidationPanel
        canProceed={importCanProceed}
        mappingReadiness={mappingReadiness}
        parsedImport={parsedImport}
      />
      <SectionCard title="Connected to">
        <p className="text-sm font-medium text-foreground">{selectedProject}</p>
      </SectionCard>
    </aside>
  </div>
)
