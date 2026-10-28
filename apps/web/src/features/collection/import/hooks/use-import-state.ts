import { type FileCheckReport, workbookSheetNames } from '@pathways/imports'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useCurrentRole } from '@/hooks/use-current-role'
import type { AutomaticMappingReceipt } from '@/lib/api/imports.schema'
import type { SensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { getVerifiedRouteAccess, principalHasAtomicPermission } from '@/lib/rbac/policy'
import type {
  DigitalFormDefinition,
  ImportBatchDefinition,
  ImportRowDefinition,
  ImportSourceColumn,
  ProjectSummary,
} from '@/types/pathways'

import type { ImportProcessingState } from '../components/import-processing-panel'
import type { ColumnRuleDraft } from '../components/import-value-map-editor'
import type { ImportProcessingProgress } from '../import-auto-continue'
import { mappingLockedStatuses } from '../import.utils'
import { useImportBatch } from './use-import-batch'

export function useImportState(scope: SensitiveDraftOwner) {
  const { profile } = useCurrentRole()
  const canUpload = principalHasAtomicPermission(profile, 'imports.upload')
  const canReview = principalHasAtomicPermission(profile, 'imports.review')
  const canValidate = principalHasAtomicPermission(profile, 'imports.validate')
  const canProcess = principalHasAtomicPermission(profile, 'imports.process')
  const canManageForms = principalHasAtomicPermission(profile, 'forms.manage')
  const canOpenForms = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/forms').allowed,
  )
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [forms, setForms] = useState<DigitalFormDefinition[]>([])
  const [formsState, setFormsState] = useState<'loading' | 'ready' | 'error'>('ready')
  const [formId, setFormId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // The file check running on Upload privately, and what it found for the person to see before anything is sent.
  const [checking, setChecking] = useState(false)
  const [fileCheck, setFileCheck] = useState<FileCheckReport | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // The chosen file's worksheets, null while they are read; a workbook with several needs one chosen.
  const [sheetNames, setSheetNames] = useState<string[] | null>([])
  const [sheetName, setSheetName] = useState('')
  useEffect(() => {
    setSheetName('')
    if (!file || !/\.xlsx?$/i.test(file.name)) {
      setSheetNames([])
      return
    }
    setSheetNames(null)
    let active = true
    file
      .arrayBuffer()
      .then((buffer) => workbookSheetNames(buffer))
      // An unreadable workbook offers no sheets; the server then says why it refused the file.
      .catch(() => [])
      .then((names) => {
        if (active) setSheetNames(names)
      })
    return () => {
      active = false
    }
  }, [file])
  // Why the server refused the last upload, shown on the upload card until the file or target changes.
  const [uploadRefusal, setUploadRefusal] = useState('')
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new file, project or form clears the old refusal.
  useEffect(() => setUploadRefusal(''), [file, projectId, formId])
  const [batches, setBatches] = useState<ImportBatchDefinition[]>([])
  const [batch, setBatch] = useState<ImportBatchDefinition | null>(null)
  const [rows, setRows] = useState<ImportRowDefinition[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [rules, setRules] = useState<Record<string, ColumnRuleDraft>>({})
  const [mappingNotice, setMappingNotice] = useState('')
  // The automatic-mapping receipt of each batch uploaded or re-run in this session; batch detail carries the stored coverage.
  const [receipts, setReceipts] = useState<Record<string, AutomaticMappingReceipt>>({})
  // The draft form just prepared from a batch, which the workspace then opens in the editor.
  const [draftTarget, setDraftTarget] = useState<{ projectId: string; formId: string } | null>(null)
  const mappingHeading = useRef<HTMLSpanElement>(null)
  const [pending, setPending] = useState(false)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [processing, setProcessing] = useState<{
    batchId: string
    state: ImportProcessingState
    progress: ImportProcessingProgress
    note?: string
  } | null>(null)
  const importBatch = useImportBatch()
  const mounted = useRef(true)
  const mutation = useRef<object | null>(null)
  const latest = useRef({ projectId, formId, file, batch, profile })
  latest.current = { projectId, formId, file, batch, profile }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const eligible = (
    permission: Parameters<typeof principalHasAtomicPermission>[1],
    wantedProject = latest.current.projectId,
  ) => {
    const principal = latest.current.profile
    return (
      mounted.current &&
      scope.isCurrent() &&
      principalHasAtomicPermission(principal, permission) &&
      (!wantedProject ||
        principal?.assignedProjectIds.includes(wantedProject) ||
        principal?.roles[0] === 'SYSTEM_ADMINISTRATOR' ||
        principal?.roles[0] === 'PROGRAM_MANAGER')
    )
  }
  const begin = (permission: Parameters<typeof principalHasAtomicPermission>[1]) => {
    if (mutation.current || !eligible(permission)) return null
    const snapshot = latest.current
    const marker = {}
    mutation.current = marker
    setPending(true)
    return {
      valid: (nextPermission = permission) =>
        mutation.current === marker &&
        eligible(nextPermission) &&
        snapshot.projectId === latest.current.projectId &&
        snapshot.formId === latest.current.formId &&
        snapshot.file === latest.current.file,
      finish: () => {
        if (mutation.current === marker) {
          mutation.current = null
          if (mounted.current && scope.isCurrent()) setPending(false)
        }
      },
    }
  }
  const selectedForm = forms.find((item) => item.id === (batch?.formId ?? formId))
  const sourceColumns: ImportSourceColumn[] =
    batch?.sourceColumns ??
    (batch?.sourceHeaders ?? []).map((header, index) => ({
      key: header,
      header,
      columnIndex: index + 1,
    }))
  const sourceColumnByKey = new Map(sourceColumns.map((column) => [column.key, column]))
  const storedMappingByKey = new Map(
    (batch?.mappings ?? []).map((stored) => [stored.sourceFieldName, stored]),
  )
  const mappingEditable = Boolean(
    batch && canReview && !pending && !mappingLockedStatuses.has(batch.status),
  )
  // Server suggestions still open in the reviewer's draft, for fields of the pinned form.
  const openSuggestions = sourceColumns.flatMap((column) => {
    const stored = storedMappingByKey.get(column.key)
    const suggestion = stored?.status === 'PENDING' ? stored.suggestedField : null
    return suggestion &&
      (mapping[column.key] ?? '__pending__') === '__pending__' &&
      selectedForm?.fields.some((field) => field.code === suggestion.code)
      ? [{ column, code: suggestion.code, label: suggestion.label }]
      : []
  })
  // Distinct non-empty values per source column in the loaded rows, for translation suggestions.
  const columnValues = useMemo(() => {
    const values = new Map<string, Set<string>>()
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.rawData)) {
        if (value === null || String(value).trim() === '') continue
        const seen = values.get(key) ?? new Set<string>()
        seen.add(String(value).trim())
        values.set(key, seen)
      }
    }
    return new Map([...values].map(([key, seen]) => [key, [...seen]]))
  }, [rows])

  const validationErrors = useMemo(
    () => rows.reduce((total, row) => total + row.validationErrors.length, 0),
    [rows],
  )
  return {
    batch,
    batches,
    begin,
    canManageForms,
    canOpenForms,
    canProcess,
    canReview,
    canUpload,
    canValidate,
    checking,
    columnValues,
    draftTarget,
    file,
    fileCheck,
    fileInput,
    formId,
    forms,
    formsState,
    importBatch,
    latest,
    loadAttempt,
    loadState,
    mapping,
    mappingEditable,
    mappingHeading,
    mappingNotice,
    mounted,
    mutation,
    openSuggestions,
    pending,
    processing,
    projectId,
    projects,
    receipts,
    rows,
    rules,
    scope,
    selectedForm,
    setBatch,
    setBatches,
    setChecking,
    setDraftTarget,
    setFile,
    setFileCheck,
    setFormId,
    setForms,
    setFormsState,
    setLoadAttempt,
    setLoadState,
    setMapping,
    setMappingNotice,
    setProcessing,
    setProjectId,
    setProjects,
    setReceipts,
    setRows,
    setRules,
    setSheetName,
    setUploadRefusal,
    sheetName,
    sheetNames,
    sourceColumnByKey,
    sourceColumns,
    storedMappingByKey,
    uploadRefusal,
    validationErrors,
  }
}

export type ImportState = ReturnType<typeof useImportState>
