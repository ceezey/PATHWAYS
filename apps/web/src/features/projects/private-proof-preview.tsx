'use client'
import { ProofPreviewDialog } from '@/components/pathways/proof-preview-dialog'
import { Button } from '@/components/ui/button'
import { saveCoreArtifact } from '@/lib/services/core-feature-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type { PrivateProofFile } from '@/lib/services/private-proof-client'
import { Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** Opens a private proof in a modal only on click; the one fetched Blob also feeds Download. */
export function PrivateProofPreview({
  ariaLabel,
  disabled,
  isCurrent,
  fetchProof,
  label,
  title,
}: {
  ariaLabel?: string
  disabled?: boolean
  isCurrent: () => boolean
  fetchProof: (signal: AbortSignal) => Promise<PrivateProofFile>
  label: string
  title: string
}) {
  const [open, setOpen] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const load = async () => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    try {
      const file = await fetchProof(next.signal)
      if (!isCurrent()) throw new PathwaysClientError('Proof access changed.', 'unauthorized')
      return file
    } catch (error) {
      throw error instanceof PathwaysClientError
        ? error
        : new Error('Private inspection is unavailable. Reload after checking your access.')
    }
  }
  return (
    <>
      <Button
        aria-label={ariaLabel}
        className="gap-2"
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Eye aria-hidden="true" className="h-4 w-4" />
        {label}
      </Button>
      <ProofPreviewDialog
        load={load}
        onOpenChange={(next) => {
          if (!next) controller.current?.abort()
          setOpen(next)
        }}
        open={open}
        save={(file) => saveCoreArtifact(file, isCurrent)}
        title={title}
      />
    </>
  )
}
