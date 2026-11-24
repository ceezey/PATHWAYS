'use client'
import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { rulesHumanClient } from '@/lib/api/rules'
import { type CurrentDryRun, type HumanRule, formatSeverityBasis } from '@pathways/shared'
import { useState } from 'react'
import { dryRunOutcome } from '../rules.copy'
import { EvidenceTable } from './evidence-table'

/** Runs the saved project rule on today's project data on the server; nothing is recorded. */
export function RuleCurrentTest({
  rule,
  isCurrent,
}: { rule: HumanRule; isCurrent: () => boolean }) {
  const [result, setResult] = useState<CurrentDryRun | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy || !isCurrent()) return
    setBusy(true)
    setNotice('')
    setResult(null)
    try {
      const value = await rulesHumanClient.dryRunCurrent(rule.id)
      if (!isCurrent()) return
      if (value.ruleId !== rule.id) throw new Error('Mismatched test response')
      setResult(value)
    } catch {
      if (isCurrent())
        setNotice(
          'The current-data test could not be completed. Verify current access and try again.',
        )
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }
  const text = result?.severityBasis ? formatSeverityBasis(result.severityBasis) : null
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>
        {busy ? 'Testing current data...' : 'Test on current data'}
      </Button>
      {notice ? <output className="block text-sm text-danger">{notice}</output> : null}
      {result ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-foreground">
              Current data result for {result.reportingDate}
            </h4>
            <StatusBadge tone={dryRunOutcome[result.result].tone}>
              {dryRunOutcome[result.result].label}
            </StatusBadge>
          </div>
          <EvidenceTable evidence={result.conditions} caption="Current project data" />
          {text ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{text.headline}</p>
              <p className="text-sm text-muted-foreground">{text.reason}</p>
            </div>
          ) : null}
          {result.conditions.some((item) => item.cell.reason === 'UNSUPPORTED_SOURCE') ? (
            <p className="text-sm text-muted-foreground">
              Indicator, budget, beneficiary, survey and KPI conditions cannot be read from current
              data in a test. Enter test values for them below.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
