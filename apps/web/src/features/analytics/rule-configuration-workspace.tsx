'use client'

import { CheckCircle2, Pencil, Plus, Power, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { can } from '@/lib/rbac/can'
import type {
  RuleCategory,
  RuleDefinition,
  RuleOperator,
  RuleSeverity,
  RuleStatus,
} from '@/types/pathways'

import {
  humanReviewDisclaimer,
  operatorCopy,
  ruleSeverityTone,
  ruleStatusTone,
} from './analytics-utils'

const categories: RuleCategory[] = [
  'KPI / Indicator',
  'Activity Timeline',
  'Budget',
  'Beneficiary Progress',
  'Assessment',
  'Project Health',
]
const operators: RuleOperator[] = ['below', 'above', 'between', 'equals']
const severities: RuleSeverity[] = ['Low', 'Medium', 'High', 'Critical']
const statuses: RuleStatus[] = ['Active', 'Inactive']

type RuleDraft = Omit<RuleDefinition, 'id' | 'triggeredCount' | 'lastTriggeredAt'>
type RuleFieldErrors = Partial<Record<'name' | 'parameter' | 'suggestedAction', string>>

const emptyDraft: RuleDraft = {
  name: '',
  category: 'KPI / Indicator',
  parameter: 'KPI achievement rate',
  operator: 'below',
  threshold: 70,
  severity: 'High',
  status: 'Active',
  suggestedAction:
    'Review beneficiary outreach strategy and intensify vocational track engagement.',
  description: 'Prototype rule created from the rule configuration form.',
}

export const RuleConfigurationWorkspace = ({
  initialRules,
}: { initialRules: RuleDefinition[] }) => {
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
  const canConfigureRules = can(role, 'rules.configure')
  const [rules, setRules] = useState(initialRules)
  const [selectedRuleId, setSelectedRuleId] = useState(initialRules[0]?.id ?? '')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft)
  const [fieldErrors, setFieldErrors] = useState<RuleFieldErrors>({})

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) ?? rules[0],
    [rules, selectedRuleId],
  )
  const activeCount = rules.filter((rule) => rule.status === 'Active').length

  const openCreate = () => {
    if (!canConfigureRules) {
      toast.error('Rule configuration is only available to System Administrator.')
      return
    }

    setEditingRuleId(null)
    setDraft(emptyDraft)
    setFieldErrors({})
    setDialogOpen(true)
  }

  const openEdit = (rule: RuleDefinition) => {
    if (!canConfigureRules) {
      toast.error('Rule editing is only available to System Administrator.')
      return
    }

    setEditingRuleId(rule.id)
    setFieldErrors({})
    setDraft({
      name: rule.name,
      category: rule.category,
      parameter: rule.parameter,
      operator: rule.operator,
      threshold: rule.threshold,
      upperThreshold: rule.upperThreshold,
      severity: rule.severity,
      status: rule.status,
      suggestedAction: rule.suggestedAction,
      description: rule.description,
    })
    setDialogOpen(true)
  }

  const saveRule = () => {
    if (!canConfigureRules) {
      toast.error('Rule configuration is only available to System Administrator.')
      return
    }

    const nextErrors: RuleFieldErrors = {}
    if (!draft.name.trim()) nextErrors.name = 'Enter a rule name.'
    if (!draft.parameter.trim()) nextErrors.parameter = 'Enter a rule parameter.'
    if (!draft.suggestedAction.trim()) {
      nextErrors.suggestedAction = 'Enter a suggested action.'
    }
    setFieldErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      toast.error('Check the required rule fields.', {
        description: 'Each invalid field now has an inline message.',
      })
      return
    }

    // TODO(RBAC): Restrict rule configuration to authorized administrators.
    // TODO(BACKEND): Persist rule definitions and lifecycle transitions.
    if (editingRuleId) {
      setRules((current) =>
        current.map((rule) => (rule.id === editingRuleId ? { ...rule, ...draft } : rule)),
      )
      setSelectedRuleId(editingRuleId)
    } else {
      const rule: RuleDefinition = {
        ...draft,
        id: `rule-prototype-${Date.now().toString(36)}`,
        triggeredCount: 0,
      }
      setRules((current) => [rule, ...current])
      setSelectedRuleId(rule.id)
    }

    setDialogOpen(false)
    toast.success(editingRuleId ? 'Rule updated locally.' : 'Prototype rule created.', {
      description: 'This demonstration keeps the rule in your current browser session only.',
    })
  }

  const toggleRuleStatus = (rule: RuleDefinition) => {
    if (!canConfigureRules) {
      toast.error('Rule activation is only available to System Administrator.')
      return
    }

    // TODO(BACKEND): Persist rule definitions and lifecycle transitions.
    const nextStatus: RuleStatus = rule.status === 'Active' ? 'Inactive' : 'Active'
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, status: nextStatus } : item)),
    )
    toast.success(`Rule marked ${nextStatus.toLowerCase()} locally.`)
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">Decision Support</StatusBadge>
            <StatusBadge tone={canConfigureRules ? 'neutral' : 'warning'}>
              {canConfigureRules ? 'Configuration access' : 'View-only access'}
            </StatusBadge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {labels.moduleAlertsRepository}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Review predefined alert and recommendation rules for human-reviewed decision support.
              System Administrators can demonstrate prototype-only configuration; no autonomous
              action is taken.
            </p>
          </div>
        </div>
        {canConfigureRules ? (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Create rule
          </Button>
        ) : null}
      </section>

      <section className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
        {humanReviewDisclaimer} Rules are predefined conditions configured by people; each alert and
        recommendation requires human review before action is taken.
      </section>

      <Tabs className="space-y-4" defaultValue="repository">
        <TabsList>
          <TabsTrigger value="repository">Alerts Repository</TabsTrigger>
          {canConfigureRules ? <TabsTrigger value="create">Create rule</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="repository" className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                {rules.length} rules configured
              </h2>
              <p className="text-sm text-muted-foreground">
                {activeCount} active · {rules.length - activeCount} inactive
              </p>
            </div>
            <div className="mt-4 space-y-3">
              {rules.map((rule) => (
                <button
                  aria-pressed={selectedRule?.id === rule.id}
                  key={rule.id}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    selectedRule?.id === rule.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:bg-muted/60'
                  }`}
                  type="button"
                  onClick={() => setSelectedRuleId(rule.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{rule.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {rule.category} · {rule.parameter} {operatorCopy(rule.operator)}{' '}
                        {rule.threshold}
                        {rule.upperThreshold ? ` to ${rule.upperThreshold}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedRule?.id === rule.id ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Selected
                        </span>
                      ) : null}
                      <StatusBadge tone={ruleSeverityTone(rule.severity)}>
                        {rule.severity}
                      </StatusBadge>
                      <StatusBadge tone={ruleStatusTone(rule.status)}>{rule.status}</StatusBadge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {rule.suggestedAction}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {selectedRule ? (
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground">Selected rule</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <InfoRow label="Rule name" value={selectedRule.name} />
                  <InfoRow label="Category" value={selectedRule.category} />
                  <InfoRow label="Parameter" value={selectedRule.parameter} />
                  <InfoRow label="Operator" value={selectedRule.operator} />
                  <InfoRow label="Threshold" value={`${selectedRule.threshold}`} />
                  <InfoRow
                    label="Optional upper threshold"
                    value={selectedRule.upperThreshold ? `${selectedRule.upperThreshold}` : 'None'}
                  />
                  <InfoRow label="Severity" value={selectedRule.severity} />
                  <InfoRow label="Status" value={selectedRule.status} />
                </div>
                <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm leading-6">
                  <p className="font-medium text-foreground">Suggested action</p>
                  <p className="mt-2 text-muted-foreground">{selectedRule.suggestedAction}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canConfigureRules ? (
                    <>
                      <Button variant="outline" onClick={() => openEdit(selectedRule)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit rule
                      </Button>
                      <Button variant="outline" onClick={() => toggleRuleStatus(selectedRule)}>
                        <Power className="mr-2 h-4 w-4" aria-hidden="true" />
                        {selectedRule.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <aside className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground">Trigger history</h2>
                <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm">
                  <p className="text-muted-foreground">Triggered total</p>
                  <p className="mt-1 text-3xl font-semibold text-foreground">
                    {selectedRule.triggeredCount}
                  </p>
                  <p className="mt-3 text-muted-foreground">
                    Last triggered: {selectedRule.lastTriggeredAt ?? 'Not yet triggered'}
                  </p>
                </div>
              </aside>
            </section>
          ) : null}
        </TabsContent>
        {canConfigureRules ? (
          <TabsContent value="create">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Create rule</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open the rule form to create a prototype rule definition.
                  </p>
                </div>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  New rule
                </Button>
              </div>
            </section>
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRuleId ? 'Edit rule' : 'Create rule'}</DialogTitle>
            <DialogDescription>
              Define a predefined condition and suggested action for human review.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              saveRule()
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel htmlFor="rule-name">Rule name</RequiredLabel>
                <Input
                  aria-describedby={fieldErrors.name ? 'rule-name-error' : undefined}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-required="true"
                  id="rule-name"
                  value={draft.name}
                  onChange={(event) => setDraftValue('name', event.target.value, setDraft)}
                />
                <InlineError id="rule-name-error" message={fieldErrors.name} />
              </div>
              <Field label="Category">
                <Select
                  value={draft.category}
                  onValueChange={(value) =>
                    setDraftValue('category', value as RuleCategory, setDraft)
                  }
                >
                  <SelectTrigger aria-label="Rule category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="space-y-2">
                <RequiredLabel htmlFor="rule-parameter">Parameter</RequiredLabel>
                <Input
                  aria-describedby={fieldErrors.parameter ? 'rule-parameter-error' : undefined}
                  aria-invalid={Boolean(fieldErrors.parameter)}
                  aria-required="true"
                  id="rule-parameter"
                  value={draft.parameter}
                  onChange={(event) => setDraftValue('parameter', event.target.value, setDraft)}
                />
                <InlineError id="rule-parameter-error" message={fieldErrors.parameter} />
              </div>
              <Field label="Operator">
                <Select
                  value={draft.operator}
                  onValueChange={(value) =>
                    setDraftValue('operator', value as RuleOperator, setDraft)
                  }
                >
                  <SelectTrigger aria-label="Rule operator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {operator}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Threshold">
                <Input
                  aria-label="Rule threshold"
                  type="number"
                  value={draft.threshold}
                  onChange={(event) =>
                    setDraftValue('threshold', Number(event.target.value), setDraft)
                  }
                />
              </Field>
              <Field label="Optional upper threshold">
                <Input
                  aria-label="Optional upper threshold"
                  type="number"
                  value={draft.upperThreshold ?? ''}
                  onChange={(event) =>
                    setDraftValue(
                      'upperThreshold',
                      event.target.value ? Number(event.target.value) : undefined,
                      setDraft,
                    )
                  }
                />
              </Field>
              <Field label="Severity">
                <Select
                  value={draft.severity}
                  onValueChange={(value) =>
                    setDraftValue('severity', value as RuleSeverity, setDraft)
                  }
                >
                  <SelectTrigger aria-label="Rule severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {severities.map((severity) => (
                      <SelectItem key={severity} value={severity}>
                        {severity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={draft.status}
                  onValueChange={(value) => setDraftValue('status', value as RuleStatus, setDraft)}
                >
                  <SelectTrigger aria-label="Rule status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="space-y-2 md:col-span-2">
                <RequiredLabel htmlFor="rule-suggested-action">Suggested action</RequiredLabel>
                <Input
                  aria-describedby={
                    fieldErrors.suggestedAction ? 'rule-suggested-action-error' : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.suggestedAction)}
                  aria-required="true"
                  id="rule-suggested-action"
                  value={draft.suggestedAction}
                  onChange={(event) =>
                    setDraftValue('suggestedAction', event.target.value, setDraft)
                  }
                />
                <InlineError
                  id="rule-suggested-action-error"
                  message={fieldErrors.suggestedAction}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium">Description</span>
                <Textarea
                  aria-label="Rule description"
                  value={draft.description}
                  onChange={(event) => setDraftValue('description', event.target.value, setDraft)}
                />
              </div>
            </div>
            <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
              <p className="font-medium">Rule preview</p>
              <p className="mt-2">
                When {draft.parameter} {operatorCopy(draft.operator)} {draft.threshold}
                {draft.upperThreshold ? ` and ${draft.upperThreshold}` : ''}, send a{' '}
                {draft.severity} alert and recommend: {draft.suggestedAction}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {editingRuleId ? 'Save changes' : 'Save rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const setDraftValue = <Key extends keyof RuleDraft>(
  key: Key,
  value: RuleDraft[Key],
  setDraft: React.Dispatch<React.SetStateAction<RuleDraft>>,
) => setDraft((current) => ({ ...current, [key]: value }))

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <span className="text-sm font-medium">{label}</span>
    {children}
  </div>
)

const RequiredLabel = ({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) => (
  <Label htmlFor={htmlFor}>
    {children}
    <span aria-hidden="true" className="ml-1 text-danger">
      *
    </span>
    <span className="sr-only"> (required)</span>
  </Label>
)

const InlineError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p className="text-sm font-medium text-danger" id={id}>
      {message}
    </p>
  ) : null

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value}</p>
  </div>
)
