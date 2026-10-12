import type { ActivityProof } from '@/types/pathways'

export type ProofGroup = ActivityProof & { proofIds: string[]; items: ActivityProof[] }

// One card per submitted update: the API returns one proof row per uploaded file.
// The rows are kept so each file shows its own review state and reason.
export const groupProofsByUpdate = (proofs: ActivityProof[]) => {
  const groups = new Map<string, ProofGroup>()
  for (const proof of proofs) {
    const names = proof.fileNames?.length ? proof.fileNames : [proof.fileName]
    const group = groups.get(proof.updateId)
    if (group) {
      group.fileNames = [...(group.fileNames ?? []), ...names]
      group.proofIds.push(proof.id)
      group.items.push(proof)
    } else {
      groups.set(proof.updateId, {
        ...proof,
        files: undefined,
        fileNames: names,
        proofIds: [proof.id],
        items: [proof],
      })
    }
  }
  return [...groups.values()]
}

export const proofTone = (status: ActivityProof['status']) => {
  if (status === 'Accepted') return 'success'
  if (status === 'Flagged') return 'danger'
  if (status === 'Submitted') return 'warning'
  return 'neutral'
}

export const formatProofDate = (value: string) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
