'use client'

import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePermission } from '@/hooks/use-permission'
import { PathwaysClientError } from '@/lib/api/core/request'
import { rulesHumanClient } from '@/lib/api/rules'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { type HumanRule, draftRuleSchema } from '@pathways/shared'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { type Rec, appendRec, conditionSummary, newRec, titleCase } from '../rules.utils'
import { RecommendationFields } from './recommendation-fields'
import type { RuleOutcome } from './rule-drawer'
import { RuleStepCard } from './rule-step-card'

type Props = {
  projects: { id: string; title: string }[]
  /** Recommendations already saved on rules in scope, offered for reuse in the builder. */
  library?: Rec[]
  /** The authorized organization-wide recommendation library is still loading. */
  libraryPending?: boolean
  /** Alert rules the current user may update, offered when adding recommendations. */
  alertLibrary?: HumanRule[]
  /** The authorized organization-wide alert library is still loading. */
  alertLibraryPending?: boolean
  /** Inline renders the builder in the page beside a sticky preview instead of a side panel. */
  inline?: boolean
  onClose: () => void
  onSaved: (scopeProjectId: string | null, outcome?: RuleOutcome) => void
}

export function RecommendationRuleDrawer({
  library,
  libraryPending,
  alertLibrary = [],
  alertLibraryPending = false,
  projects,
  inline,
  onClose,
  onSaved,
  owner,
}: Props & { owner: SensitiveDraftOwner }) {
  const { profile, access } = useCurrentRole()
  const has = usePermission()
  const [selectedAlert, setSelectedAlert] = useState<HumanRule | null>(null)
  // Recommendation text can be composed before an alert is selected. Choosing an
  // alert retains those local drafts and adds them to that alert's saved responses.
  const [recs, setRecs] = useState<Rec[]>([newRec()])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const sourceOwner = useSensitiveDraftOwner(
    profile,
    'rule-drawer-recommendation-source',
    'rules.update',
    selectedAlert?.projectId ?? null,
    selectedAlert ? `${selectedAlert.id}:${selectedAlert.version}` : 'unselected',
    access === 'ready',
  )
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const isCurrent = () => mounted.current && owner.isCurrent() && sourceOwner?.isCurrent()
  const canWrite = has('rules.update')
  const availableAlerts = alertLibrary.filter((item) => item.status !== 'ARCHIVED')
  const projectNames = new Map(projects.map((project) => [project.id, project.title]))
  const projectLabel = (item: HumanRule) =>
    item.projectId
      ? (projectNames.get(item.projectId) ?? 'Project unavailable in your workspace')
      : 'Organization template'
  const choose = (item: HumanRule) => {
    const selectedSourceIds = new Set(selectedAlert?.recommendations.map((item) => item.id))
    const pending = recs.filter(
      (recommendation) =>
        !selectedSourceIds.has(recommendation.id) &&
        Boolean(recommendation.title.trim() || recommendation.text.trim()),
    )
    if (item.recommendations.length + pending.length > 10) {
      setNotice(
        'The selected alert already has too many recommendations to add these drafts. Choose another alert or remove a recommendation from it first.',
      )
      return
    }
    setSelectedAlert(item)
    setRecs([...item.recommendations.map((recommendation) => ({ ...recommendation })), ...pending])
    setLibraryOpen(false)
    setNotice('')
  }
  const addRecommendation = () => setRecs((current) => appendRec(current, newRec()))
  const save = async () => {
    if (!selectedAlert) return setNotice('Choose an existing alert first.')
    if (!sourceOwner || !isCurrent() || inFlight.current) return
    if (!recs.length || recs.some((item) => !item.title.trim() || !item.text.trim()))
      return setNotice('Add at least one recommendation, each with a title and suggested response.')
    const parsed = draftRuleSchema.safeParse({
      name: selectedAlert.name,
      severity: selectedAlert.severity,
      conditions: selectedAlert.conditions,
      recommendations: recs,
      expectedVersion: selectedAlert.version,
      clientOperationId: crypto.randomUUID(),
    })
    if (!parsed.success)
      return setNotice(parsed.error.issues[0]?.message ?? 'Review the recommendation fields.')
    inFlight.current = true
    setBusy(true)
    setLocked(true)
    setNotice('')
    try {
      await rulesHumanClient.draftRule(selectedAlert.id, parsed.data)
      if (isCurrent()) onSaved(selectedAlert.projectId, 'drafted')
    } catch (error) {
      if (!isCurrent()) return
      setLocked(false)
      if (error instanceof PathwaysClientError && [400, 403, 404, 409].includes(error.status ?? 0))
        setNotice(
          error.message ||
            'The recommendation could not be saved. Refresh the selected alert and verify current access.',
        )
      else setNotice('A response was not confirmed. Retry the same operation.')
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }
  const builder = (
    <div className="space-y-6">
      <form
        className="space-y-6"
        id="rule-drawer-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <fieldset className="space-y-6" disabled={busy || locked || !canWrite}>
          <RuleStepCard
            step={1}
            title="Choose an existing alert"
            hint="Choose the alert whose recommendations you want to update. Its conditions and severity stay unchanged."
          >
            <div className="space-y-2 rounded-md border border-border bg-surface-subtle p-3">
              <p className="text-sm font-medium">Alert library</p>
              <p className="text-sm text-muted-foreground" id="alert-library-description">
                Choose an alert configuration to receive recommendations. Saving creates a new draft
                of that alert.
              </p>
              {selectedAlert ? (
                <output className="block rounded-md border border-border bg-card p-3">
                  <span className="block font-medium">{selectedAlert.name}</span>
                  <span className="mt-1 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>Project: {projectLabel(selectedAlert)}</span>
                    <span>Condition: {conditionSummary(selectedAlert.conditions)}</span>
                    <span>Severity: {titleCase(selectedAlert.severity)}</span>
                    <span>Status: {titleCase(selectedAlert.status)}</span>
                  </span>
                </output>
              ) : null}
              <Button
                aria-controls="alert-library-options"
                aria-describedby="alert-library-description"
                aria-expanded={libraryOpen}
                type="button"
                variant="outline"
                onClick={() => setLibraryOpen((open) => !open)}
              >
                {libraryOpen
                  ? 'Hide alert library'
                  : selectedAlert
                    ? 'Choose a different alert'
                    : 'Choose from alert library'}
              </Button>
              {libraryOpen ? (
                <div className="space-y-2" id="alert-library-options">
                  {alertLibraryPending ? (
                    <output className="block text-sm text-muted-foreground">
                      Loading alerts you can update in this organization.
                    </output>
                  ) : availableAlerts.length ? (
                    <ul className="space-y-2">
                      {availableAlerts.map((item) => (
                        <li
                          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
                          key={item.id}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{item.name}</span>
                            <span className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                              <span>Project: {projectLabel(item)}</span>
                              <span>Condition: {conditionSummary(item.conditions)}</span>
                              <span>Severity: {titleCase(item.severity)}</span>
                              <span>Status: {titleCase(item.status)}</span>
                            </span>
                          </span>
                          <Button type="button" variant="outline" onClick={() => choose(item)}>
                            Choose alert
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <output className="block text-sm text-muted-foreground">
                      No editable alerts are available in this organization yet. Create an alert
                      rule first.
                    </output>
                  )}
                </div>
              ) : null}
            </div>
          </RuleStepCard>
          <RuleStepCard
            step={2}
            title="What should the system recommend?"
            hint="Write the response the system retrieves when the selected alert matches. It is stored, not generated."
            action={
              <Button
                aria-label="Add recommendation"
                disabled={recs.length >= 10}
                size="icon"
                title="Add recommendation"
                type="button"
                variant="outline"
                onClick={addRecommendation}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          >
            <RecommendationFields
              hasRule={Boolean(selectedAlert)}
              hideAddButton
              library={library}
              libraryPending={libraryPending}
              onRecs={setRecs}
              recs={recs}
            />
            {!selectedAlert ? (
              <output className="block text-sm text-muted-foreground">
                Choose an alert before saving this recommendation.
              </output>
            ) : null}
          </RuleStepCard>
        </fieldset>
      </form>
      {notice ? (
        <p className="text-sm text-danger" role="alert">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-row-reverse flex-wrap justify-start gap-2 rounded-md border border-border bg-card p-3">
        {canWrite ? (
          <Button
            className="w-40"
            disabled={busy || locked || !selectedAlert}
            form="rule-drawer-form"
            type="submit"
          >
            {busy ? 'Saving...' : 'Save recommendation'}
          </Button>
        ) : null}
        {inline ? (
          <Button className="w-40" type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
  return builder
}
