'use client'
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
        <li key={file.id} className="break-all rounded-sm border border-border px-3 py-2">
          {file.name}
        </li>
      ))}
    </ul>
  )
}
