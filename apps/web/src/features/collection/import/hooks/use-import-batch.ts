import { useRef } from 'react'

import { importsClient } from '@/lib/api/imports'
import type { ImportBatchDefinition } from '@/types/pathways'

// Holds what the collection and import screens share about one upload: its retry identity, automatic mapping and the stop flag.
export function useImportBatch() {
  const upload = useRef<{ target: readonly unknown[]; id: string } | null>(null)
  const stopRequested = useRef(false)

  return {
    stopRequested,
    // A retried upload of the same target keeps its client import id so the server can replay it.
    uploadId(target: readonly unknown[]) {
      if (
        !upload.current ||
        target.length !== upload.current.target.length ||
        !target.every((part, index) => part === upload.current?.target[index])
      ) {
        upload.current = { target, id: crypto.randomUUID() }
      }
      return upload.current.id
    },
    forgetUpload() {
      upload.current = null
    },
    // Runs conservative automatic mapping once for a stored batch with no mapping revision that did not fail, else returns null.
    async mapAutomatically(projectId: string, batch: ImportBatchDefinition) {
      if (
        batch.status === 'FAILED' ||
        batch.mappingRevision !== 0 ||
        batch.storageStatus !== 'STORED'
      )
        return null
      return importsClient.automaticImportMapping(projectId, batch.id, 0)
    },
  }
}
