'use client'

import { Button } from '@/components/ui/button'
import { recoverSourceMutation } from '@/lib/services/pathways-client'
import { type SourceMutationContext, sourceMutationTickets } from '@/lib/services/source-mutation'
import { useEffect, useRef, useState } from 'react'

/** No body, actor or request identity is rendered. Recovery always reauthorizes on the API. */
function OwnedSourceMutationRecovery({
  context,
  prefix,
  onRecovered,
}: {
  context: SourceMutationContext | null
  prefix: string
  onRecovered: (result: 'ABANDONED' | 'COMMITTED') => Promise<() => void>
}) {
  const [, redraw] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const operationInFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(
    () =>
      sourceMutationTickets.subscribe(() => {
        if (mounted.current) redraw((value) => value + 1)
      }),
    [],
  )
  const pending = context
    ? sourceMutationTickets
        .pendingOperations(context, prefix)
        .filter(
          (ticket) =>
            !/^POST:\/projects\/[0-9a-f-]{36}\/activities\/[0-9a-f-]{36}\/updates$/i.test(
              ticket.operation,
            ),
        )
    : []
  const recover = async (operation: string) => {
    if (!context?.isCurrent() || operationInFlight.current) return
    operationInFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await recoverSourceMutation(context, operation)
      if (!mounted.current || !context.isCurrent()) return
      const applyReload = await onRecovered(result)
      if (!mounted.current || !context.isCurrent()) return
      sourceMutationTickets.finishRecovery(context, operation)
      applyReload()
    } catch (caught) {
      if (!mounted.current || !context.isCurrent()) return
      setError(
        caught instanceof Error
          ? caught.message
          : 'Recovery is unavailable. Keep the original request and retry.',
      )
    } finally {
      operationInFlight.current = false
      if (mounted.current && context.isCurrent()) setBusy(false)
    }
  }
  if (!pending.length) return null
  return (
    <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
      <p className="text-sm">
        An earlier save has not been confirmed. Retry its unchanged input, or check its outcome and
        reload before editing.
      </p>
      {pending.map((ticket) => (
        <Button
          key={ticket.operation}
          type="button"
          variant="outline"
          disabled={busy || ticket.pending}
          onClick={() => void recover(ticket.operation)}
        >
          Check outcome and reload
        </Button>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function SourceMutationRecovery(props: Parameters<typeof OwnedSourceMutationRecovery>[0]) {
  const current = useRef({ context: props.context, prefix: props.prefix, revision: 0 })
  if (current.current.context !== props.context || current.current.prefix !== props.prefix)
    current.current = {
      context: props.context,
      prefix: props.prefix,
      revision: current.current.revision + 1,
    }
  return <OwnedSourceMutationRecovery key={current.current.revision} {...props} />
}
