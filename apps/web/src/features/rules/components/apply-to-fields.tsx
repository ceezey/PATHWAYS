'use client'

import { MetricTooltip } from '@/components/pathways/metric-tooltip'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  type MetricScope,
  SCOPES,
  availableMetrics,
  scopeGuidance,
  selectClass,
} from '../rules.utils'

function ScopeOption({
  scope,
  unavailable,
  checked,
  message,
  description,
  onToggle,
}: {
  scope: MetricScope
  unavailable: boolean
  checked: boolean
  message: string
  description: string
  onToggle: () => void
}) {
  const tooltipText = unavailable ? `${description}. ${message}` : description
  return (
    <div className="flex items-center gap-1">
      <label
        className={cn('flex items-center gap-2 text-sm', unavailable && 'text-muted-foreground')}
      >
        <input checked={checked} disabled={unavailable} onChange={onToggle} type="checkbox" />
        {scope}
      </label>
      <MetricTooltip label={`${scope} scope`}>{tooltipText}</MetricTooltip>
    </div>
  )
}

export function ApplyToFields({
  locked,
  scopeProjectId,
  projects,
  scopes,
  onToggle,
  onProject,
}: {
  locked: boolean
  scopeProjectId: string | null
  projects: { id: string; title: string }[]
  scopes: MetricScope[]
  onToggle: (scope: MetricScope) => void
  onProject: (value: string) => void
}) {
  const organizationTemplate = scopeProjectId === null
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <Label htmlFor="rule-scope">Rule scope</Label>
        <div className="rounded-md border border-border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <select
            className={cn(
              selectClass,
              'rounded-b-none rounded-t-md border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
            )}
            disabled={locked}
            id="rule-scope"
            value={scopeProjectId ?? ''}
            onChange={(event) => onProject(event.target.value)}
          >
            <option value="">Organization template</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          <fieldset
            aria-label="Applies To"
            className="rounded-b-md border-t border-border bg-background p-3"
          >
            <div className="grid grid-cols-3 gap-2">
              {SCOPES.map((scope) => {
                const missing = availableMetrics([scope]).length === 0
                const needsProject = organizationTemplate && scope === 'Indicator'
                const unavailable = missing || needsProject
                const message = needsProject
                  ? 'Indicator metrics require a project record.'
                  : 'Not in the rule metric catalog yet'
                return (
                  <ScopeOption
                    checked={scopes.includes(scope)}
                    description={scopeGuidance[scope]}
                    key={scope}
                    message={message}
                    scope={scope}
                    unavailable={unavailable}
                    onToggle={() => onToggle(scope)}
                  />
                )
              })}
            </div>
          </fieldset>
        </div>
      </div>
      <p className="px-3 text-sm leading-5 text-muted-foreground">
        Check every scope that applies to a rule. If unsure, one scope is enough.
      </p>
    </div>
  )
}
