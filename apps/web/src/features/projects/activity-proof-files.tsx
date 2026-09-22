'use client'

import { ExternalLink, Eye, FileText } from 'lucide-react'
import { useState } from 'react'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { getProofFilePreview } from '@/lib/files/proof-file-previews'
import type { ActivityProof, ActivityProofFile } from '@/types/pathways'

const proofFiles = (proof: ActivityProof): ActivityProofFile[] =>
  proof.files?.length
    ? proof.files
    : (proof.fileNames?.length ? proof.fileNames : [proof.fileName]).map((name, index) => ({
        id: `legacy-${proof.id}-${index}`,
        name,
        size: 0,
        type: '',
      }))

const fileSize = (size: number) => {
  if (!size) return 'File size unavailable'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function ActivityProofFiles({ proof }: { proof: ActivityProof }) {
  const [selected, setSelected] = useState<ActivityProofFile | null>(null)
  const preview = selected ? getProofFilePreview(selected.id) : undefined

  return (
    <>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {proofFiles(proof).map((file) => (
          <li key={file.id}>
            <button
              className="flex w-full items-center gap-2 rounded-sm border border-border px-3 py-2 text-left hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSelected(file)}
              type="button"
            >
              <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-all">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">Preview</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogShell
          title="Proof file preview"
          description={
            selected ? `${selected.name} · ${fileSize(selected.size)}` : 'Selected proof'
          }
        >
          {selected && preview ? (
            <div className="space-y-4">
              {preview.type.startsWith('image/') ? (
                <img
                  alt={`Preview of ${selected.name}`}
                  className="max-h-[60vh] w-full rounded-sm border border-border object-contain"
                  src={preview.url}
                />
              ) : preview.type === 'application/pdf' || preview.type.startsWith('text/') ? (
                <iframe
                  className="h-[60vh] w-full rounded-sm border border-border bg-background"
                  src={preview.url}
                  title={`Preview of ${selected.name}`}
                />
              ) : (
                <div className="rounded-sm border border-border bg-surface-subtle p-5 text-center">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    This file type cannot be embedded, but it can be opened in a new browser tab.
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button asChild className="gap-2">
                  <a href={preview.url} rel="noreferrer" target="_blank">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Open file
                  </a>
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <p className="rounded-sm border border-info/25 bg-info-subtle p-4 text-sm text-info">
              This file has metadata only. Open it from the stored evidence record when available.
            </p>
          )}
        </DialogShell>
      </Dialog>
    </>
  )
}
