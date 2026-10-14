'use client'

type Props = {
  step: number
  title: string
  hint?: string
  children: React.ReactNode
}
/** One numbered step of the rule builder, so the drawer reads as a guided sequence. */
export function RuleStepCard({ step, title, hint, children }: Props) {
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
        >
          {step}
        </span>
        <div className="space-y-1">
          <h3 className="font-semibold">{title}</h3>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}
