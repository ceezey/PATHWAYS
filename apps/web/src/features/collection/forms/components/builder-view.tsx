'use client'

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'

import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ActivitySummary, ProjectSummary } from '@/types/pathways'

import {
  type CollectionMode,
  type FormField,
  dataTypeLabels,
  statusTone,
} from '../../collection.utils'
import { FieldEditor } from './field-editor'
import { FormInfoPanel } from './form-info-panel'
import { FormPreviewPanel } from './form-preview-panel'
import { MetadataMapPanel } from './metadata-map-panel'

export const BuilderView = ({
  addField,
  canManage,
  canPublish,
  deleteField,
  fields,
  formTitle,
  formType,
  journeyStage,
  linkedActivityId,
  metadataCount,
  metadataCoverage,
  mappedCount,
  mode,
  moveField,
  onPublish,
  projectActivities,
  projects,
  projectsLoaded,
  projectId,
  sadddCount,
  selectedField,
  selectedFieldId,
  selectedProject,
  setFormTitle,
  setFormType,
  setJourneyStage,
  setLinkedActivityId,
  setProjectId,
  setSaveDialogOpen,
  setSelectedFieldId,
  updateField,
}: {
  addField: () => void
  canManage: boolean
  canPublish: boolean
  deleteField: (fieldId: string) => void
  fields: FormField[]
  formTitle: string
  formType: string
  journeyStage: string
  linkedActivityId: string
  metadataCount: number
  metadataCoverage: number
  mappedCount: number
  mode: CollectionMode
  moveField: (fieldId: string, direction: 'up' | 'down') => void
  onPublish: () => void
  projectActivities: ActivitySummary[]
  projects: ProjectSummary[]
  projectsLoaded: boolean
  projectId: string
  sadddCount: number
  selectedField?: FormField
  selectedFieldId: string
  selectedProject: string
  setFormTitle: (value: string) => void
  setFormType: (value: string) => void
  setJourneyStage: (value: string) => void
  setLinkedActivityId: (value: string) => void
  setProjectId: (value: string) => void
  setSaveDialogOpen: (open: boolean) => void
  setSelectedFieldId: (fieldId: string) => void
  updateField: (fieldId: string, patch: Partial<FormField>) => void
}) => (
  <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-4">
      <FormInfoPanel
        showHeading
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
        title={mode === 'extend' ? 'Imported fields and extensions' : 'Form field list'}
        description={`${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`}
        actions={
          <>
            <StatusBadge tone="success">{mappedCount} mapped</StatusBadge>
            <StatusBadge tone="info">{metadataCount} metadata keys</StatusBadge>
            <StatusBadge tone="neutral">{sadddCount} SADDD fields</StatusBadge>
          </>
        }
      >
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className={cn(
                'rounded-lg border border-border bg-card p-3 transition-colors',
                selectedFieldId === field.id && 'border-primary bg-primary-subtle',
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <button
                  aria-pressed={selectedFieldId === field.id}
                  className="flex flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id={`collection-field-choice-${field.id}`}
                  type="button"
                  onClick={() => setSelectedFieldId(field.id)}
                >
                  <GripVertical className="mt-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">{field.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dataTypeLabels[field.type]} · {field.code}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedFieldId === field.id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Selected
                        </span>
                      ) : null}
                      {field.required ? <StatusBadge tone="neutral">Required</StatusBadge> : null}
                      {field.metadataKey ? (
                        <StatusBadge tone="info">Metadata key</StatusBadge>
                      ) : null}
                      {field.sadddField ? (
                        <StatusBadge tone="neutral">SADDD field</StatusBadge>
                      ) : null}
                      <StatusBadge tone={statusTone(field.mappingStatus)}>
                        {field.mappingStatus}
                      </StatusBadge>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`Move ${field.label} up`}
                    disabled={index === 0}
                    size="icon"
                    variant="ghost"
                    onClick={() => moveField(field.id, 'up')}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Move ${field.label} down`}
                    disabled={index === fields.length - 1}
                    size="icon"
                    variant="ghost"
                    onClick={() => moveField(field.id, 'down')}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Edit ${field.label}`}
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedFieldId(field.id)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Delete ${field.label}`}
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteField(field.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {selectedFieldId === field.id ? (
                <FieldEditor field={field} updateField={updateField} />
              ) : null}
            </div>
          ))}
        </div>

        {canManage ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <Button id="collection-add-field" variant="outline" onClick={addField}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add field
            </Button>
            <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              Save draft
            </Button>
            {canPublish ? (
              <Button className="md:col-span-2" onClick={onPublish}>
                Publish saved draft
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            This form is available as read-only for your current role.
          </p>
        )}
      </SectionCard>
    </div>

    <aside className="min-w-0 space-y-4">
      <MetadataMapPanel
        fields={fields}
        mappedCount={mappedCount}
        metadataCoverage={metadataCoverage}
        selectedField={selectedField}
        selectedProject={selectedProject}
      />
      <FormPreviewPanel fields={fields} formTitle={formTitle} />
    </aside>
  </div>
)
