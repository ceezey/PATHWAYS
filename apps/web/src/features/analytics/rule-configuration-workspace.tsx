'use client'

import { Pencil, Plus, Power, Save } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

const emptyDraft: RuleDraft = {
  name: '',
  category: 'KPI / Indicator',
  parameter: 'KPI achievement rate',
  operator: 'below',
  threshold: 70,
  severity: 'High',
  status: 'Active',
  suggestedAction:
    'Review participant outreach strategy and intensify vocational track engagement.',
  description: 'Prototype rule created from the rule configuration form.',
}

export const RuleConfigurationWorkspace = ({
  initialRules,
}: { initialRules: RuleDefinition[] }) => {
  const [rules, setRules] = useState(initialRules)
  const [selectedRuleId, setSelectedRuleId] = useState(initialRules[0]?.id ?? '')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft)

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) ?? rules[0],
    [rules, selectedRuleId],
  )
  const activeCount = rules.filter((rule) => rule.status === 'Active').length

  const openCreate = () => {
    setEditingRuleId(null)
    setDraft(emptyDraft)
    setDialogOpen(true)
  }

  const openEdit = (rule: RuleDefinition) => {
    setEditingRuleId(rule.id)
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
    if (!draft.name.trim() || !draft.parameter.trim() || !draft.suggestedAction.trim()) {
      toast.error('Rule name, parameter, and suggested action are required.')
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
      description: 'Rules are not persisted to a backend in this GUI phase.',
    })
  }

  const toggleRuleStatus = (rule: RuleDefinition) => {
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
            <StatusBadge tone="info">Rule center</StatusBadge>
            <StatusBadge tone="neutral">System Administrator preview</StatusBadge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Rule configuration
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Configure predefined alert and recommendation rules for human-reviewed decision
              support. No autonomous action is taken.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Create rule
        </Button>
      </section>

      <section className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
        {humanReviewDisclaimer} Rules are predefined conditions configured by people; each alert and
        recommendation requires human review before action is taken.
      </section>

      <Tabs className="space-y-4" defaultValue="repository">
        <TabsList>
          <TabsTrigger value="repository">Rule repository</TabsTrigger>
          <TabsTrigger value="create">Create rule</TabsTrigger>
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
                  <Button variant="outline" onClick={() => openEdit(selectedRule)}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                    Edit rule
                  </Button>
                  <Button variant="outline" onClick={() => toggleRuleStatus(selectedRule)}>
                    <Power className="mr-2 h-4 w-4" aria-hidden="true" />
                    {selectedRule.status === 'Active' ? 'Deactivate' : 'Activate'}
                  </Button>
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
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRuleId ? 'Edit rule' : 'Create rule'}</DialogTitle>
            <DialogDescription>
              Define a predefined condition and suggested action for human review.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Rule name">
              <Input
                value={draft.name}
                onChange={(event) => setDraftValue('name', event.target.value, setDraft)}
              />
            </Field>
            <Field label="Category">
              <Select
                value={draft.category}
                onValueChange={(value) =>
                  setDraftValue('category', value as RuleCategory, setDraft)
                }
              >
                <SelectTrigger>
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
            <Field label="Parameter">
              <Input
                value={draft.parameter}
                onChange={(event) => setDraftValue('parameter', event.target.value, setDraft)}
              />
            </Field>
            <Field label="Operator">
              <Select
                value={draft.operator}
                onValueChange={(value) =>
                  setDraftValue('operator', value as RuleOperator, setDraft)
                }
              >
                <SelectTrigger>
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
                type="number"
                value={draft.threshold}
                onChange={(event) =>
                  setDraftValue('threshold', Number(event.target.value), setDraft)
                }
              />
            </Field>
            <Field label="Optional upper threshold">
              <Input
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
                <SelectTrigger>
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
                <SelectTrigger>
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
              <span className="text-sm font-medium">Suggested action</span>
              <Input
                value={draft.suggestedAction}
                onChange={(event) => setDraftValue('suggestedAction', event.target.value, setDraft)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Description</span>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={draft.description}
                onChange={(event) => setDraftValue('description', event.target.value, setDraft)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
            <p className="font-medium">Rule preview</p>
            <p className="mt-2">
              When {draft.parameter} {operatorCopy(draft.operator)} {draft.threshold}
              {draft.upperThreshold ? ` and ${draft.upperThreshold}` : ''}, send a {draft.severity}{' '}
              alert and recommend: {draft.suggestedAction}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRule}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {editingRuleId ? 'Save changes' : 'Save and activate rule'}
            </Button>
          </DialogFooter>
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

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value}</p>
  </div>
)
