'use client'
import { Download, FileText } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ProofPreviewDialog } from '@/components/pathways'
import { saveCoreArtifact } from '@/lib/services/core-feature-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ActivityProof } from '@/types/pathways'

import { ProofStatusBadge } from './activity-detail-sections'

type ProofFile = {
  id: string
  name: string
  status?: ActivityProof['status']
  reason?: string | null
}

/**
 * One row per submitted file. A principal holding evidence.read opens the document itself
 * through the activity proof download; everyone else sees its metadata only.
 */
export function ActivityProofFiles({
  activityId,
  canOpen = false,
  proof,
  projectId,
}: {
  activityId?: string
  canOpen?: boolean
  proof: ActivityProof & { items?: ActivityProof[] }
  projectId?: string
}) {
  const [opened, setOpened] = useState<ProofFile | null>(null)
  const files: ProofFile[] = proof.items?.length
    ? proof.items.map((item) => ({
        id: item.id,
        name: item.fileName,
        status: item.status,
        reason: item.rejectionReason,
      }))
    : proof.files?.length
      ? proof.files.map((file) => ({ id: file.id, name: file.name }))
      : (proof.fileNames?.length ? proof.fileNames : [proof.fileName]).map((name, index) => ({
          id: `${proof.id}:${index}`,
          name,
        }))
  // Opening needs the real evidence id, which only the per-file rows carry.
  const openable = canOpen && Boolean(projectId && activityId && proof.items?.length)

  return (
    <>
      <ul aria-label="Submitted proof metadata" className="space-y-2 text-sm text-muted-foreground">
        {files.map((file) => {
          const row = (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
                <FileText aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-all font-medium text-foreground">{file.name}</span>
                {file.reason ? (
                  <span className="mt-1 block border-l-2 border-warning pl-2 text-xs text-warning">
                    {file.reason}
                  </span>
                ) : null}
              </span>
              {file.status ? <ProofStatusBadge status={file.status} /> : null}
            </>
          )
          return (
            <li key={file.id}>
              {openable ? (
                <button
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setOpened(file)}
                  type="button"
                >
                  {row}
                  <Download aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  {row}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {openable ? (
        <ProofPreviewDialog
          load={async () => ({
            blob: await pathwaysClient.downloadActivityProof(
              projectId ?? '',
              activityId ?? '',
              opened?.id ?? '',
            ),
            fileName: opened?.name ?? 'proof',
          })}
          onOpenChange={(open) => {
            if (!open) setOpened(null)
          }}
          open={opened !== null}
          save={saveCoreArtifact}
          title={opened?.name ?? 'Submitted proof'}
        />
      ) : null}
    </>
  )
}
