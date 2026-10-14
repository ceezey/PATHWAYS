'use client'

import { UnavailableHint } from '@/components/pathways'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { type MetricScope, SCOPES, availableMetrics, selectClass } from '../rules.utils'

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
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="rule-scope">Rule scope</Label>
        <select
          className={selectClass}
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
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SCOPES.map((scope) => {
          const missing = availableMetrics([scope]).length === 0
          const hint = `scope-unavailable-${scope.replaceAll(' ', '-')}`
          return (
            <label
              className={cn('flex items-center gap-2 text-sm', missing && 'text-muted-foreground')}
              key={scope}
              title={missing ? 'Not in the rule metric catalog yet' : undefined}
            >
              <input
                aria-describedby={missing ? hint : undefined}
                checked={scopes.includes(scope)}
                disabled={missing}
                onChange={() => onToggle(scope)}
                type="checkbox"
              />
              {scope}
              {missing ? (
                <UnavailableHint id={hint} message="Not in the rule metric catalog yet" />
              ) : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}
