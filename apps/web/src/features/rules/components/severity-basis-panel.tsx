import { type HumanAlert, formatSeverityBasis } from '@pathways/shared'
import { alertSeverityRank, severityText } from '../rules.utils'

const manilaDay = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Manila',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')} ${get('month')}`
}
// A manual Critical never moves, so its change is worded from the system's own suggestion.
const changeLine = (alert: HumanAlert) => {
  const { severityChange: change, severityBasis: basis } = alert
  if (!change || !basis) return null
  const day = manilaDay(change.at)
  const manual = basis.manualCritical
  const from = manual ? change.previous.level : change.from
  const to = manual ? basis.level : change.to
  const [a, b] = [severityText(from), severityText(to)]
  if (from === null || to === null) return `Changed from ${a} to ${b} on ${day}`
  const verb = alertSeverityRank(to) < alertSeverityRank(from) ? 'raised' : 'lowered'
  return manual
    ? `System suggestion ${verb} from ${a} to ${b} on ${day}`
    : `${verb[0]?.toUpperCase()}${verb.slice(1)} from ${a} to ${b} on ${day}`
}

/** Why an alert has its level: the reason, what is missing, any change and the manual Critical note. */
export function SeverityBasisPanel({ alert }: { alert: HumanAlert }) {
  const basis = alert.severityBasis
  if (!basis) return <p className="text-sm">Stored level: {severityText(alert.severity)}</p>
  const text = formatSeverityBasis(basis)
  const change = changeLine(alert)
  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <h3 className="font-semibold">Why this level</h3>
      <p className="font-medium">{text.headline}</p>
      {text.reason ? <p className="text-sm">{text.reason}</p> : null}
      {text.missing.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {text.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {basis.manualCritical ? (
        <p className="text-sm">System suggestion: {severityText(basis.level)}</p>
      ) : null}
      {change ? <p className="text-sm text-muted-foreground">{change}</p> : null}
    </section>
  )
}
