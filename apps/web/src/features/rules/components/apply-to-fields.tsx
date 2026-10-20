'use client'

import { MetricTooltip } from '@/components/pathways/metric-tooltip'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CheckCircle2, Circle } from 'lucide-react'
import {
  type MetricScope,
  SCOPE_GRID_ORDER,
  availableMetrics,
  scopeDisplayLabel,
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
    <div
      className={cn(
        'flex items-center gap-1 rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
        checked ? 'border-primary bg-primary-subtle' : 'border-border bg-card',
      )}
    >
      <label
        className={cn(
          'flex flex-1 cursor-pointer items-center gap-2 text-sm',
          // Fade only the label: card opacity would also fade the tooltip and trap it under later cards.
          unavailable && 'cursor-not-allowed text-muted-foreground opacity-60',
        )}
      >
        <input
          checked={checked}
          className="sr-only"
          disabled={unavailable}
          onChange={onToggle}
          type="checkbox"
        />
        {checked ? (
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Circle aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {scopeDisplayLabel[scope] ?? scope}
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
        <Label htmlFor="rule-scope">Monitoring area(s)</Label>
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SCOPE_GRID_ORDER.map((scope) => {
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
        Choose one or more monitoring areas.
      </p>
    </div>
  )
}
