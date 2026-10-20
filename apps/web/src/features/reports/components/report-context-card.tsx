'use client'

import { AsyncState, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { cn } from '@/lib/utils'
import type { ReportKindCode } from '@pathways/shared'
import { Save } from 'lucide-react'
import type { ReportContext } from '../hooks/use-report-context'
import type { ReportGeneration } from '../hooks/use-report-generation'
import { reportKindLabels } from '../reports.copy'
import { RoundSelect } from './round-select'
import { SurveyFormSelect } from './survey-form-select'

export function ReportContextCard({
  context,
  generation,
  previewOnly,
}: {
  context: Pick<
    ReportContext,
    | 'profile'
    | 'projects'
    | 'currentProjects'
    | 'id'
    | 'setSelection'
    | 'kind'
    | 'setKind'
    | 'allowed'
    | 'forms'
    | 'currentForms'
    | 'formId'
    | 'setSelectedForm'
    | 'rounds'
    | 'currentRounds'
    | 'evaluationId'
    | 'setSelectedRound'
    | 'preview'
    | 'currentPreview'
  >
  generation: Pick<
    ReportGeneration,
    'owner' | 'currentName' | 'setName' | 'format' | 'setFormat' | 'busy' | 'generate'
  >
  previewOnly: boolean
}) {
  const { profile, projects, currentProjects, id, setSelection, kind, setKind, allowed } = context
  const { preview, currentPreview } = context
  const { owner, currentName, setName, format, setFormat, busy, generate } = generation
  // A survey or round field makes four, so the grid stays even instead of wrapping one field.
  const fourFields = kind === 'SURVEY_FORM_RESULTS' || kind === 'EVALUATION_REPORT'
  return (
    <SectionCard
      title="Report context"
      description="Unavailable and suppressed cells retain their meaning in every export."
    >
      {projects.isError ? (
        <AsyncState
          status="error"
          title="Project access unavailable"
          description="Current report project access could not be verified."
          onRetry={() => void projects.refetch()}
        />
      ) : projects.isPending ? (
        <AsyncState
          status="loading"
          title="Loading projects"
          description="Verifying current report project access."
        />
      ) : null}
      <div
        className={cn(
          'grid gap-4',
          fourFields ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3',
        )}
      >
        <Label className="space-y-2">
          <span>Project</span>
          <Select
            value={id ?? ''}
            onValueChange={setSelection}
            disabled={projects.isError || projects.isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {currentProjects?.map((value) => (
                <SelectItem key={value.id} value={value.id}>
                  {value.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <Label className="space-y-2">
          <span>Report type</span>
          <Select value={kind} onValueChange={(value) => setKind(value as ReportKindCode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((value) => (
                <SelectItem key={value} value={value}>
                  {reportKindLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <SurveyFormSelect context={context} />
        <RoundSelect context={context} />
        <Label className="space-y-2">
          <span>Format</span>
          <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['CSV', 'XLSX', 'XLS', 'PDF'] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="block text-xs text-muted-foreground">
            PDF includes charts and DSD styling.
          </span>
        </Label>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Label className="grow space-y-2">
          <span>Report name</span>
          <Input
            maxLength={200}
            disabled={!owner}
            value={currentName}
            onChange={(event) =>
              owner &&
              setName({
                owner: owner.key,
                generation: owner.generation,
                value: event.target.value,
              })
            }
            placeholder="Project report"
          />
        </Label>
        {!previewOnly && principalHasAtomicPermission(profile, 'reports.generate') && (
          <Button
            disabled={
              !owner ||
              !currentPreview?.columns.length ||
              busy ||
              preview.isError ||
              preview.isPending
            }
            onClick={() => void generate()}
          >
            <Save className="mr-2 h-4 w-4" />
            {busy ? 'Generating' : 'Generate private report'}
          </Button>
        )}
      </div>
    </SectionCard>
  )
}
