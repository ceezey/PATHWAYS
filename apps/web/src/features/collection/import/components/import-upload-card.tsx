'use client'

import { Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { BatchReview } from '../hooks/use-batch-review'
import type { ImportState } from '../hooks/use-import-state'
import { FileCheckDialog } from './file-check-dialog'

export function ImportUploadCard({
  state,
  review,
}: {
  state: Pick<
    ImportState,
    | 'canUpload'
    | 'checking'
    | 'file'
    | 'fileCheck'
    | 'fileInput'
    | 'formId'
    | 'forms'
    | 'formsState'
    | 'mutation'
    | 'pending'
    | 'projectId'
    | 'projects'
    | 'scope'
    | 'setBatch'
    | 'setBatches'
    | 'setFile'
    | 'setFormId'
    | 'setForms'
    | 'setProjectId'
    | 'setRows'
    | 'setSheetName'
    | 'sheetName'
    | 'sheetNames'
    | 'uploadRefusal'
  >
  review: Pick<BatchReview, 'closeFileCheck' | 'fixFile' | 'upload' | 'uploadAnyway'>
}) {
  const {
    canUpload,
    checking,
    file,
    fileCheck,
    fileInput,
    formId,
    forms,
    formsState,
    mutation,
    pending,
    projectId,
    projects,
    scope,
    setBatch,
    setBatches,
    setFile,
    setFormId,
    setForms,
    setProjectId,
    setRows,
    setSheetName,
    sheetName,
    sheetNames,
    uploadRefusal,
  } = state
  const { closeFileCheck, fixFile, upload, uploadAnyway } = review
  return (
    <Card>
      <CardHeader>
        <CardTitle>Private source upload</CardTitle>
        <CardDescription>
          Files are sent to the backend, checked within finite limits, and stored under a
          server-generated private object key. CSV, XLSX, XLS and text-based PDF are supported.
          Scanned PDFs have no text to read; export those as CSV or XLSX.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Project</Label>
          <Select
            value={projectId}
            onValueChange={(value) => {
              if (mutation.current || !scope.isCurrent()) return
              setProjectId(value)
              setFile(null)
              setFormId('')
              setForms([])
              setBatches([])
              setBatch(null)
              setRows([])
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Published form version</Label>
          <Select
            value={formId}
            onValueChange={(value) => {
              if (!mutation.current && scope.isCurrent()) {
                setFormId(value)
                setFile(null)
              }
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  projectId && formsState === 'error'
                    ? 'Forms could not be loaded.'
                    : projectId && formsState === 'ready' && forms.length === 0
                      ? 'No forms available.'
                      : 'Choose form'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {projectId && formsState === 'loading' ? (
                // Shown only when the list is opened before the published forms arrive.
                <output
                  aria-label="Loading published form versions"
                  className="block space-y-2 p-2"
                >
                  <div className="h-3 w-3/4 animate-pulse rounded-full bg-secondary" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-surface-subtle" />
                  <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-subtle" />
                </output>
              ) : forms.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  {formsState === 'error' ? 'Forms could not be loaded.' : 'No forms available.'}
                </p>
              ) : (
                forms.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.name} - v{form.version}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="import-file">Source file</Label>
          <Input
            id="import-file"
            key={projectId}
            ref={fileInput}
            accept=".csv,.xlsx,.xls,.pdf"
            disabled={!canUpload || pending}
            type="file"
            onChange={(event) => {
              if (!mutation.current && scope.isCurrent()) setFile(event.target.files?.[0] ?? null)
            }}
          />
        </div>
        {sheetNames && sheetNames.length > 1 ? (
          <div className="space-y-2 md:col-start-3">
            <Label htmlFor="import-sheet">Sheet</Label>
            <Select
              value={sheetName || undefined}
              onValueChange={(value) => {
                if (!mutation.current && scope.isCurrent()) setSheetName(value)
              }}
            >
              <SelectTrigger id="import-sheet">
                <SelectValue placeholder={`Choose one of ${sheetNames.length} sheets`} />
              </SelectTrigger>
              <SelectContent>
                {sheetNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {uploadRefusal ? (
          <p className="text-sm text-danger md:col-span-3" role="alert">
            {uploadRefusal}
          </p>
        ) : null}
        <div className="md:col-span-3">
          <Button
            disabled={
              !canUpload ||
              pending ||
              !file ||
              !formId ||
              sheetNames === null ||
              (sheetNames.length > 1 && !sheetName)
            }
            onClick={() => void upload()}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            {checking ? 'Checking file...' : pending ? 'Working...' : 'Upload privately'}
          </Button>
        </div>
      </CardContent>
      {fileCheck ? (
        <FileCheckDialog
          report={fileCheck}
          fileInput={fileInput}
          onFix={fixFile}
          onUploadAnyway={() => void uploadAnyway()}
          onClose={closeFileCheck}
        />
      ) : null}
    </Card>
  )
}
