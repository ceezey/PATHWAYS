'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import { rulesHumanClient } from '@/lib/services/rules-human-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useEffect, useRef, useState } from 'react'
import { RuleConditionEditor, leafCount, newCondition } from './rule-condition-editor'
import { type HumanRule, createRuleSchema, draftRuleSchema } from './rules-human-contract'
import type { RuleNode } from './rules-validation'

type Props = {
  projectId: string | null
  original?: HumanRule
  template?: HumanRule
  onSaved: () => void
}
const requires = (node: RuleNode, prefix: string): boolean =>
  node.kind === 'GROUP'
    ? node.children.some((child) => requires(child, prefix))
    : node.metric.startsWith(prefix)
export function RuleEditor(props: Props) {
  const { profile, access } = useCurrentRole()
  const owner = useSensitiveDraftOwner(
    profile,
    'rule-editor',
    props.original ? 'rules.update' : 'rules.create',
    props.projectId,
    props.original
      ? `${props.original.id}:${props.original.version}`
      : `new:${props.template?.id ?? ''}:${props.template?.version ?? ''}`,
    access === 'ready',
  )
  if (!owner) return <output>Current rule authoring access is required.</output>
  return <OwnedRuleEditor key={`${owner.generation}:${owner.key}`} {...props} owner={owner} />
}
function OwnedRuleEditor({
  projectId,
  original,
  template,
  onSaved,
  owner,
}: Props & { owner: SensitiveDraftOwner }) {
  const initial = original ?? template
  const { profile } = useCurrentRole()
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(original?.code ?? '')
  const [severity, setSeverity] = useState<HumanRule['severity']>(initial?.severity ?? 'LOW')
  const [conditions, setConditions] = useState<RuleNode>(
    initial?.conditions ?? { kind: 'GROUP', mode: 'AND', children: [newCondition()] },
  )
  const [recommendations, setRecommendations] = useState(
    initial?.recommendations.map((item) => ({
      ...item,
      id: original ? item.id : crypto.randomUUID(),
    })) ?? [{ id: crypto.randomUUID(), title: '', text: '' }],
  )
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const captured = useRef<
    | Parameters<typeof rulesHumanClient.createRule>[0]
    | Parameters<typeof rulesHumanClient.draftRule>[1]
    | null
  >(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const isCurrent = () => mounted.current && owner.isCurrent()
  const indicators = useAuthorizedRead(
    'rule-binding-indicators',
    projectId,
    'indicators.read',
    (signal) => pathwaysClient.getProjectIndicators(projectId ?? '', signal),
    Boolean(projectId && requires(conditions, 'INDICATOR_')),
  )
  const activities = useAuthorizedRead(
    'rule-binding-activities',
    projectId,
    'activities.read',
    (signal) => pathwaysClient.getActivities(projectId ?? '', signal),
    Boolean(projectId && requires(conditions, 'ACTIVITY_OVERDUE_DAYS')),
  )
  const submit = async () => {
    if (!isCurrent() || inFlight.current) return
    if (!captured.current) {
      const content = {
        name,
        severity,
        conditions,
        recommendations,
        clientOperationId: crypto.randomUUID(),
      }
      const parsed = original
        ? draftRuleSchema.safeParse({ ...content, expectedVersion: original.version })
        : createRuleSchema.safeParse({
            ...content,
            code,
            ...(projectId ? { projectId } : {}),
            ...(template ? { templateId: template.id } : {}),
          })
      if (!parsed.success) {
        setNotice(parsed.error.issues[0]?.message ?? 'Review the rule fields.')
        return
      }
      captured.current = parsed.data
    }
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      if (original && 'expectedVersion' in captured.current)
        await rulesHumanClient.draftRule(original.id, captured.current)
      else if ('code' in captured.current) await rulesHumanClient.createRule(captured.current)
      if (isCurrent()) {
        captured.current = null
        onSaved()
      }
    } catch (error) {
      if (!isCurrent()) return
      if (
        error instanceof PathwaysClientError &&
        [400, 403, 404, 409].includes(error.status ?? 0)
      ) {
        captured.current = null
        setLocked(false)
        setNotice(
          'The rule could not be saved. Verify your access, project records, and current version before retrying.',
        )
      } else
        setNotice(
          'A save response was not confirmed. Retry the same saved request before changing its content.',
        )
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy || locked}>
        <div className="space-y-2">
          <Label htmlFor="rule-name">Rule name</Label>
          <Input
            id="rule-name"
            value={name}
            required
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-code">Rule code</Label>
          <Input
            id="rule-code"
            value={code}
            disabled={Boolean(original)}
            required={!original}
            maxLength={80}
            onChange={(event) => setCode(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Use capital letters, numbers, underscores, or hyphens.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-severity">Severity</Label>
          <select
            className="h-10 w-full rounded-sm border border-input bg-background px-3"
            id="rule-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as HumanRule['severity'])}
          >
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Use up to 32 conditions in four levels of groups. Thresholds retain their entered decimal
        precision.
      </p>
      <RuleConditionEditor
        node={conditions}
        onChange={setConditions}
        disabled={busy || locked}
        remainingLeaves={32 - leafCount(conditions)}
        indicators={indicators.data?.map((item) => ({ id: item.id, name: item.name })) ?? []}
        activities={activities.data?.map((item) => ({ id: item.id, name: item.title })) ?? []}
      />
      {requires(conditions, 'INDICATOR_') || requires(conditions, 'ACTIVITY_OVERDUE_DAYS') ? (
        <div className="space-y-2 text-sm">
          <p>
            Record-bound metrics require a project scope and current permission to read its records.
          </p>
          {indicators.isError ? (
            <Button onClick={() => void indicators.refetch()} type="button" variant="outline">
              Retry indicator choices
            </Button>
          ) : null}
          {activities.isError ? (
            <Button onClick={() => void activities.refetch()} type="button" variant="outline">
              Retry activity choices
            </Button>
          ) : null}
          {projectId &&
          ((!principalHasAtomicPermission(profile, 'indicators.read') &&
            requires(conditions, 'INDICATOR_')) ||
            (!principalHasAtomicPermission(profile, 'activities.read') &&
              requires(conditions, 'ACTIVITY_OVERDUE_DAYS'))) ? (
            <p>Current permission for the selected record type is required.</p>
          ) : null}
        </div>
      ) : null}
      <fieldset className="space-y-4" disabled={busy || locked}>
        <legend className="font-semibold">Predefined recommendations</legend>
        {recommendations.map((recommendation, index) => (
          <div className="space-y-2 rounded-sm border border-border p-3" key={recommendation.id}>
            <Label htmlFor={`recommendation-title-${recommendation.id}`}>
              Recommendation {index + 1} title
            </Label>
            <Input
              id={`recommendation-title-${recommendation.id}`}
              maxLength={160}
              required
              value={recommendation.title}
              onChange={(event) =>
                setRecommendations((values) =>
                  values.map((value) =>
                    value.id === recommendation.id
                      ? { ...value, title: event.target.value }
                      : value,
                  ),
                )
              }
            />
            <Label htmlFor={`recommendation-text-${recommendation.id}`}>Recommendation text</Label>
            <Textarea
              id={`recommendation-text-${recommendation.id}`}
              maxLength={2000}
              required
              value={recommendation.text}
              onChange={(event) =>
                setRecommendations((values) =>
                  values.map((value) =>
                    value.id === recommendation.id ? { ...value, text: event.target.value } : value,
                  ),
                )
              }
            />
            {recommendations.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRecommendations((values) =>
                    values.filter((value) => value.id !== recommendation.id),
                  )
                }
              >
                Remove recommendation {index + 1}
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={recommendations.length >= 10 || busy || locked}
          onClick={() =>
            setRecommendations((values) => [
              ...values,
              { id: crypto.randomUUID(), title: '', text: '' },
            ])
          }
        >
          Add recommendation
        </Button>
      </fieldset>
      {notice ? <output className="block text-sm">{notice}</output> : null}
      <Button disabled={busy} type="submit">
        {busy ? 'Saving...' : locked ? 'Retry same save' : original ? 'Save draft' : 'Create draft'}
      </Button>
    </form>
  )
}
