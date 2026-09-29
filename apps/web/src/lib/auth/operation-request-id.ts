import { useRef } from 'react'

/** Memory-only retry identity. A response failure retains the exact owned operation. */
export function operationRequestId(createId: () => string = () => crypto.randomUUID()) {
  let pending: { owner: string; body: string; id: string } | null = null
  return {
    forBody(owner: string, body: unknown) {
      const serialized = JSON.stringify(body)
      if (!pending || pending.owner !== owner || pending.body !== serialized)
        pending = { owner, body: serialized, id: createId() }
      return pending.id
    },
    acknowledge(id: string) {
      if (pending?.id === id) pending = null
    },
  }
}

export function useOperationRequestId() {
  const request = useRef<ReturnType<typeof operationRequestId> | null>(null)
  if (!request.current) request.current = operationRequestId()
  return request.current
}
