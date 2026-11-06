'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Opens the form editor on a draft just prepared from an import; mounted only once the draft exists.
export function ImportOpenDraft({ target }: { target: { projectId: string; formId: string } }) {
  const router = useRouter()
  useEffect(() => {
    router.push(
      `/collection/projects/${encodeURIComponent(target.projectId)}/forms/${encodeURIComponent(target.formId)}`,
    )
  }, [router, target.projectId, target.formId])
  return <output className="sr-only">Opening the draft form.</output>
}
