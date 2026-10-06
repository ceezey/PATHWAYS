import type { ReportSections, StatusLevel } from '@/lib/services/report-sections'
import { cn } from '@/lib/utils'

const levelStyle: Record<StatusLevel, { label: string; className: string }> = {
  ON_TRACK: { label: 'ON TRACK', className: 'border-success bg-success-subtle text-success' },
  AT_RISK: { label: 'AT RISK', className: 'border-warning bg-warning-subtle text-warning' },
  OFF_TRACK: { label: 'OFF TRACK', className: 'border-danger bg-danger-subtle text-danger' },
  NOT_AVAILABLE: {
    label: 'NOT AVAILABLE',
    className: 'border-border bg-surface-subtle text-muted-foreground',
  },
}
const stateStyle: Record<string, { label: string; level: StatusLevel }> = {
  AVAILABLE: { label: 'Available', level: 'ON_TRACK' },
  ZERO: { label: 'Zero', level: 'ON_TRACK' },
  SUPPRESSED: { label: 'Fewer than 5', level: 'AT_RISK' },
  MISSING: { label: 'Not available', level: 'NOT_AVAILABLE' },
  NOT_APPLICABLE: { label: 'Not available', level: 'NOT_AVAILABLE' },
}
const pill = 'inline-block rounded border px-2 py-0.5 text-[10px] font-semibold'

export const stateLabel = (state: string) => stateStyle[state]?.label ?? 'Not available'

export function StatusPill({ level }: { level: StatusLevel }) {
  const { label, className } = levelStyle[level]
  return <span className={cn(pill, className)}>{label}</span>
}

/** Metric state as a pill that always carries its text label. */
export function StatePill({ state }: { state: string }) {
  const known = stateStyle[state]
  return known ? (
    <span className={cn(pill, levelStyle[known.level].className)}>{known.label}</span>
  ) : (
    <span className={cn(pill, levelStyle.NOT_AVAILABLE.className)}>{state}</span>
  )
}

export function Band({ title }: { title: string }) {
  return (
    <h2 className="print-avoid mt-5 bg-navy px-3 py-1.5 text-sm font-semibold text-navy-foreground">
      {title}
    </h2>
  )
}

const th = 'border border-border bg-surface-subtle px-2 py-1.5 text-left font-semibold'
export const td = 'border border-border px-2 py-1.5 align-top'
export const Table = ({
  head,
  children,
  numericLastColumn = false,
}: { head: string[]; children: React.ReactNode; numericLastColumn?: boolean }) => (
  <table className="w-full border-collapse text-xs">
    <thead className="print-table-head">
      <tr>
        {head.map((name, index) => (
          <th
            key={name}
            // A money column is right-aligned, so its heading sits over the figures.
            className={cn(th, numericLastColumn && index === head.length - 1 && 'text-right')}
          >
            {name}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="[&>tr:nth-child(even)]:bg-surface-subtle">{children}</tbody>
  </table>
)

const figureValue = (figure: NonNullable<ReportSections['keyFigures']>[number]) =>
  figure.state === 'SUPPRESSED' ? 'Fewer than 5' : (figure.value ?? 'Not available')

/** One-page Project summary body, shared by the PDF print page and the in-app preview. */
export function ProjectStatusSections({ sections }: { sections: ReportSections }) {
  const info = sections.information
  const pairs: Array<[string, string]> = [
    ['Code', info.code],
    ['Title', info.title],
    ['Status', info.status],
    ['Sector', info.sector],
    ['Area', info.area],
    ['Start date', info.startDate],
    ['End date', info.endDate],
    ['Program manager', info.manager ?? 'Not specified'],
    ['Implementing partners', info.partners],
  ]
  return (
    <div className="text-ink">
      <Band title="Project information" />
      <dl className="print-avoid grid grid-cols-2 border-x border-b border-border text-xs">
        {pairs.map(([name, value]) => (
          <div key={name} className="flex gap-2 border-t border-border px-2 py-1.5">
            <dt className="w-32 shrink-0 font-semibold text-muted-foreground">{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <Band title="Overview" />
      <Table head={['Area', 'Status', 'Comment']}>
        {sections.overview.map((row) => (
          <tr key={row.area} className="print-avoid">
            <td className={cn(td, 'font-semibold')}>{row.area}</td>
            <td className={td}>
              <StatusPill level={row.status} />
            </td>
            <td className={td}>{row.comment}</td>
          </tr>
        ))}
      </Table>
      {sections.keyFigures && (
        <>
          <Band title="Key figures" />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
            {sections.keyFigures.map((figure) => (
              <div
                key={figure.label}
                className="print-avoid rounded-md border border-border bg-surface-subtle p-2"
              >
                <p className="text-[10px] font-semibold text-muted-foreground">{figure.label}</p>
                <p className="font-heading text-lg text-navy">{figureValue(figure)}</p>
                {figure.percent !== null && (
                  <div className="mt-1 h-1.5 rounded bg-border">
                    <div
                      className="h-1.5 rounded bg-navy"
                      style={{ width: `${Math.min(Math.max(figure.percent, 0), 100)}%` }}
                    />
                  </div>
                )}
                {figure.detail && (
                  <p className="mt-1 text-[10px] text-muted-foreground">{figure.detail}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {sections.milestones && (
        <>
          <Band title="Milestones" />
          <Table head={['Milestone', 'Status', 'Target date', 'Completed', 'Flag']}>
            {sections.milestones.map((m, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: titles can repeat in an immutable snapshot
              <tr key={index} className="print-avoid">
                <td className={td}>{m.title}</td>
                <td className={td}>{m.status}</td>
                <td className={td}>{m.targetDate ?? 'Not set'}</td>
                <td className={td}>{m.completionDate ?? 'Not completed'}</td>
                <td className={td}>
                  {m.overdue && (
                    <span className={cn(pill, levelStyle.OFF_TRACK.className)}>Overdue</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
      {sections.indicators && (
        <>
          <Band title="Indicators" />
          <Table head={['Code', 'Indicator', 'Baseline', 'Target', 'Current', 'Progress']}>
            {sections.indicators.map((i) => (
              <tr key={i.code} className="print-avoid">
                <td className={td}>{i.code}</td>
                <td className={td}>{i.name}</td>
                <td className={td}>{i.baseline ?? 'Not set'}</td>
                <td className={td}>{i.target ?? 'Not set'}</td>
                <td className={td}>{i.current}</td>
                <td className={td}>{i.progress}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
      {sections.alerts && (
        <>
          <Band title="Open alerts" />
          <Table head={['Alert', 'Severity', 'Explanation', 'Last evaluated']}>
            {sections.alerts.map((a, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: titles can repeat in an immutable snapshot
              <tr key={index} className="print-avoid">
                <td className={td}>{a.title}</td>
                <td className={td}>
                  <span
                    className={cn(
                      pill,
                      levelStyle[
                        a.severity === 'LOW' || a.severity === 'MEDIUM' ? 'AT_RISK' : 'OFF_TRACK'
                      ].className,
                    )}
                  >
                    {a.severity}
                  </span>
                </td>
                <td className={td}>{a.explanation}</td>
                <td className={td}>
                  {new Date(a.evaluatedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
      <p className="print-avoid mt-4 text-[10px] text-muted-foreground">
        Status rules. Overdue means a milestone target date before the report date that is not
        completed or cancelled. Schedule: OFF TRACK when a milestone is more than 30 days overdue,
        AT RISK when any is overdue. Budget: OFF TRACK above 100 percent used, AT RISK when use
        exceeds timeline elapsed by more than 15 points. Indicators: OFF TRACK when KPI achievement
        is more than 25 points below timeline elapsed, AT RISK when more than 10 below. NOT
        AVAILABLE when an input is missing.
      </p>
    </div>
  )
}
