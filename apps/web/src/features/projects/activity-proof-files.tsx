'use client'
import { FileText } from 'lucide-react'

import type { ActivityProof } from '@/types/pathways'

export function ActivityProofFiles({ proof }: { proof: ActivityProof }) {
  const files = proof.files?.length
    ? proof.files.map((file) => ({ id: file.id, name: file.name }))
    : (proof.fileNames?.length ? proof.fileNames : [proof.fileName]).map((name, index) => ({
        id: `${proof.id}:${index}`,
        name,
      }))
  return (
    <ul aria-label="Submitted proof metadata" className="space-y-2 text-sm text-muted-foreground">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-3 break-all rounded-lg border border-border bg-card px-3 py-2"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
            <FileText aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground">{file.name}</span>
        </li>
      ))}
    </ul>
  )
}
