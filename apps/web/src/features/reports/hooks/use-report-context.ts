import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { projectsClient } from '@/lib/api/projects'
import { reportsClient } from '@/lib/api/reports'
import type { ReportKind } from '@/types/pathways'
import { type ReportKindCode, reportKindGrants } from '@pathways/shared'
import { useEffect, useState } from 'react'
import { allowedKinds } from '../reports.utils'

export const useReportContext = (initialKind: ReportKind) => {
  const { profile } = useCurrentRole()
  const [selection, setSelection] = useState<string | null>(null)
  const [selectedKind, setKind] = useState<ReportKindCode>(
    initialKind === 'indicator-summary'
      ? 'INDICATOR_SUMMARY'
      : initialKind === 'beneficiary-summary'
        ? 'BENEFICIARY_SUMMARY'
        : initialKind === 'survey-results'
          ? 'SURVEY_FORM_RESULTS'
          : 'PROJECT_SUMMARY',
  )
  const allowed = allowedKinds(profile)
  const kind = allowed.includes(selectedKind) ? selectedKind : (allowed[0] ?? 'PROJECT_SUMMARY')
  const projects = useAuthorizedRead('report-projects', null, 'reports.read', (signal) =>
    projectsClient.getProjects(signal),
  )
  const currentProjects = !projects.isError && !projects.isPending ? projects.data : undefined
  const project = currentProjects?.find((value) => value.id === selection) ?? currentProjects?.[0]
  const id = project?.id ?? null
  const [selectedForm, setSelectedForm] = useState<string | null>(null)
  const forms = useAuthorizedRead(
    'report-survey-forms',
    id,
    'forms.read',
    (signal) => reportsClient.surveyForms(id ?? '', signal),
    Boolean(id && kind === 'SURVEY_FORM_RESULTS'),
  )
  const currentForms = id && !forms.isError && !forms.isPending ? forms.data : undefined
  const formId =
    kind === 'SURVEY_FORM_RESULTS'
      ? (currentForms?.find((form) => form.id === selectedForm)?.id ?? currentForms?.[0]?.id)
      : undefined
  const [selectedRound, setSelectedRound] = useState<string | null>(null)
  const rounds = useAuthorizedRead(
    'report-evaluation-rounds',
    id,
    reportKindGrants.EVALUATION_REPORT.permission,
    (signal) => reportsClient.evaluationRounds(id ?? '', signal),
    Boolean(id && kind === 'EVALUATION_REPORT'),
  )
  const currentRounds = id && !rounds.isError && !rounds.isPending ? rounds.data : undefined
  const round =
    kind === 'EVALUATION_REPORT'
      ? (currentRounds?.find((value) => value.id === selectedRound) ?? currentRounds?.[0])
      : undefined
  const evaluationId = round?.id
  const contextReady = Boolean(
    id &&
      (kind !== 'SURVEY_FORM_RESULTS' || formId) &&
      (kind !== 'EVALUATION_REPORT' || evaluationId),
  )
  const preview = useAuthorizedRead(
    `report-preview:${kind}:${formId ?? ''}:${evaluationId ?? ''}`,
    id,
    reportKindGrants[kind].permission,
    (signal) => reportsClient.reportPreview(id ?? '', kind, signal, formId, evaluationId),
    contextReady,
  )
  const reports = useAuthorizedRead(
    'report-artifacts',
    id,
    'reports.read',
    (signal) => reportsClient.reports(id ?? '', signal),
    contextReady,
  )
  const currentPreview =
    contextReady && !preview.isError && !preview.isPending ? preview.data : undefined
  const currentReports =
    contextReady && !reports.isError && !reports.isPending ? reports.data : undefined
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset the selected survey when the authorized project changes.
  useEffect(() => {
    setSelectedForm(null)
    setSelectedRound(null)
  }, [id])
  return {
    profile,
    kind,
    allowed,
    setKind,
    projects,
    currentProjects,
    project,
    id,
    setSelection,
    forms,
    currentForms,
    formId,
    setSelectedForm,
    rounds,
    currentRounds,
    round,
    evaluationId,
    setSelectedRound,
    contextReady,
    preview,
    reports,
    currentPreview,
    currentReports,
  }
}

export type ReportContext = ReturnType<typeof useReportContext>
