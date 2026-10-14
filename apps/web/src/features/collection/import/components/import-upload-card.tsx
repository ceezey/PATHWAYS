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

export function ImportUploadCard({
  state,
  review,
}: {
  state: Pick<
    ImportState,
    | 'canUpload'
    | 'file'
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
  >
  review: Pick<BatchReview, 'upload'>
}) {
  const {
    canUpload,
    file,
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
  } = state
  const { upload } = review
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
            accept=".csv,.xlsx,.xls,.pdf"
            disabled={!canUpload || pending}
            type="file"
            onChange={(event) => {
              if (!mutation.current && scope.isCurrent()) setFile(event.target.files?.[0] ?? null)
            }}
          />
        </div>
        <div className="md:col-span-3">
          <Button
            disabled={!canUpload || pending || !file || !formId}
            onClick={() => void upload()}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            {pending ? 'Working...' : 'Upload privately'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
