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
  onTest,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div
      className={cn(
        'border-t border-border bg-card pb-1 pt-3',
        inline
          ? 'flex flex-row-reverse flex-wrap justify-start gap-2'
          : 'sticky bottom-0 flex flex-col items-end gap-2',
      )}
    >
      {canWrite ? (
        <Button className="w-40" disabled={busy || nested} form="rule-drawer-form" type="submit">
          {busy ? 'Saving...' : 'Save Rule'}
        </Button>
      ) : null}
      <Button
        className="w-40"
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
          className="w-40"
          disabled={busy}
          type="button"
          onClick={() => onConfirm('activate')}
        >
          Activate
        </Button>
      ) : null}
      {canDeactivate ? (
        <Button
          className="w-40"
          disabled={busy}
          type="button"
          variant="outline"
          onClick={() => onConfirm('deactivate')}
        >
          Deactivate
        </Button>
      ) : null}
      {onCancel ? (
        <Button className="w-40" type="button" variant="outline" onClick={() => onCancel()}>
          Cancel
        </Button>
      ) : null}
    </div>
  )
}
