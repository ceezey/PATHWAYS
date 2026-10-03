import { Button } from '@/components/ui/button'

type Props = {
  busy: boolean
  canActivate: boolean
  canDeactivate: boolean
  canWrite: boolean
  hasRule: boolean
  nested: boolean
  showTest: boolean
  onTest: () => void
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
  onTest,
  onConfirm,
}: Props) {
  return (
    <div className="sticky bottom-0 flex flex-col items-end gap-2 border-t border-border bg-card pb-1 pt-3">
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
    </div>
  )
}
