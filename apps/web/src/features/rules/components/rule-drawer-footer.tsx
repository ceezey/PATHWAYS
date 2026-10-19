import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  busy: boolean
  canActivate: boolean
  canDeactivate: boolean
  canWrite: boolean
  hasRule: boolean
  nested: boolean
  showTest: boolean
  inline?: boolean
  resizable?: boolean
  onTest: () => void
  onCancel?: () => void
  onConfirm: (action: 'activate' | 'deactivate') => void
}
/** Stacked right-aligned drawer actions: Save Rule, Test Rule, then lifecycle changes. */
export function RuleDrawerFooter({
  busy,
  canActivate,
  canDeactivate,
  canWrite,
  hasRule,
  nested,
  showTest,
  inline,
  resizable,
  onTest,
  onCancel,
  onConfirm,
}: Props) {
  const actionClass = resizable && !inline ? 'w-full' : 'w-40'
  return (
    <div
      className={cn(
        'bg-card',
        inline
          ? 'flex flex-row-reverse flex-wrap justify-start gap-2 rounded-md border border-border p-3'
          : resizable
            ? 'sticky bottom-0 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2 rounded-t-md border border-border border-b-0 p-3'
            : 'sticky bottom-0 flex flex-col items-end gap-2 rounded-t-md border border-border border-b-0 p-3',
      )}
    >
      {canWrite ? (
        <Button
          className={actionClass}
          disabled={busy || nested}
          form="rule-drawer-form"
          type="submit"
        >
          {busy ? 'Saving...' : 'Save Rule'}
        </Button>
      ) : null}
      <Button
        className={actionClass}
        disabled={!hasRule}
        title={hasRule ? undefined : 'Save the rule first to run a test'}
        type="button"
        variant="outline"
        onClick={() => onTest()}
      >
        {showTest ? 'Hide Test' : 'Test Rule'}
      </Button>
      {canActivate ? (
        <Button
          className={actionClass}
          disabled={busy}
          type="button"
          onClick={() => onConfirm('activate')}
        >
          Activate
        </Button>
      ) : null}
      {canDeactivate ? (
        <Button
          className={actionClass}
          disabled={busy}
          type="button"
          variant="outline"
          onClick={() => onConfirm('deactivate')}
        >
          Deactivate
        </Button>
      ) : null}
      {onCancel ? (
        <Button className={actionClass} type="button" variant="outline" onClick={() => onCancel()}>
          Cancel
        </Button>
      ) : null}
    </div>
  )
}
