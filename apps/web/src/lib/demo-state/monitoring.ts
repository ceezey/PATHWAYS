import type { AlertLifecycleStatus, RecommendationOutcome, RuleDefinition } from '@/types/pathways'
import { hasAction } from './permissions'
import {
  type DemoState,
  currentAccount,
  demoTime,
  getDemoState,
  nextId,
  notifyLocally,
  transactDemo,
} from './store'

export function saveRule(
  input: Omit<RuleDefinition, 'id' | 'triggeredCount' | 'lastTriggeredAt'>,
  id?: string,
) {
  return transactDemo('rules.configure', undefined, id, (state) => {
    if (
      !input.name.trim() ||
      !input.parameter.trim() ||
      !input.suggestedAction.trim() ||
      !input.description.trim()
    )
      throw new Error('Name, parameter, description and suggested action are required.')
    if (
      !Number.isFinite(input.threshold) ||
      (input.upperThreshold !== undefined &&
        (!Number.isFinite(input.upperThreshold) || input.upperThreshold <= input.threshold))
    )
      throw new Error(
        'Enter valid threshold values; an upper value must be greater than the lower value.',
      )
    if (
      state.rules.some(
        (rule) =>
          rule.id !== id &&
          rule.parameter.toLowerCase() === input.parameter.toLowerCase() &&
          rule.operator === input.operator &&
          rule.status === 'Active' &&
          input.status === 'Active',
      )
    )
      throw new Error('A conflicting active threshold already covers this parameter and operator.')
    const previous = state.rules.find((rule) => rule.id === id)
    const rule = {
      ...input,
      id: id ?? nextId(state, 'rule'),
      triggeredCount: previous?.triggeredCount ?? 0,
      lastTriggeredAt: previous?.lastTriggeredAt,
    }
    state.rules = [...state.rules.filter((r) => r.id !== id), rule]
    evaluateRules(state)
    return rule
  })
}
export function evaluateRules(state: DemoState) {
  for (const project of state.projects.filter((p) => !p.archived)) {
    for (const rule of state.rules.filter((r) => r.status === 'Active')) {
      let value: number | undefined
      if (rule.category === 'Budget') value = project.budgetUtilization
      if (rule.category === 'KPI / Indicator') value = project.kpiAchievement
      if (rule.category === 'Activity Timeline') {
        const rows = state.activities.filter((a) => a.projectId === project.id)
        value = rows.length
          ? Math.round(rows.reduce((sum, a) => sum + a.progress, 0) / rows.length)
          : undefined
      }
      if (value === undefined) continue
      const triggered =
        rule.operator === 'below'
          ? value < rule.threshold
          : rule.operator === 'above'
            ? value > rule.threshold
            : rule.operator === 'equals'
              ? value === rule.threshold
              : value >= rule.threshold && value <= (rule.upperThreshold ?? rule.threshold)
      const alertId = `generated-${rule.id}-${project.id}`
      const existing = state.alerts.find((a) => a.id === alertId)
      if (triggered && !existing) {
        state.alerts.push({
          id: alertId,
          projectId: project.id,
          severity:
            rule.severity === 'Low'
              ? 'Information'
              : rule.severity === 'Medium'
                ? 'Warning'
                : 'Critical',
          category:
            rule.category === 'Budget'
              ? 'Budget'
              : rule.category === 'Activity Timeline'
                ? 'Activity'
                : 'Indicator',
          title: rule.name,
          description: rule.description,
          createdAt: demoTime(state).slice(0, 10),
          lifecycleStatus: 'New',
          relatedType:
            rule.category === 'Budget'
              ? 'Budget'
              : rule.category === 'Activity Timeline'
                ? 'Activity'
                : 'Indicator',
          relatedId: project.id,
          currentValue: value,
          threshold: rule.threshold,
          ruleId: rule.id,
        })
        state.recommendations.push({
          id: nextId(state, 'recommendation'),
          alertId,
          ruleId: rule.id,
          alertBasis: `${rule.parameter} is ${value}; configured condition is ${rule.operator} ${rule.threshold}.`,
          ruleExplanation: `If ${rule.parameter} is ${rule.operator} ${rule.threshold}, flag for human review.`,
          text: rule.suggestedAction,
          reviewStatus: 'New',
        })
        rule.triggeredCount += 1
        rule.lastTriggeredAt = demoTime(state)
      }
      if (
        !triggered &&
        existing &&
        !['Resolved', 'Dismissed', 'Auto-resolved'].includes(existing.lifecycleStatus)
      )
        existing.lifecycleStatus = 'Auto-resolved'
    }
  }
}
const history = (
  state: DemoState,
  id: string,
  status: string,
  note: string,
  actor = currentAccount(state),
) => {
  const decisions = state.decisionHistory[id] ?? []
  decisions.push({
    id: nextId(state, 'history'),
    at: demoTime(state),
    actor: actor?.name ?? 'System',
    state: status,
    note,
  })
  state.decisionHistory[id] = decisions
}
export function reviewAlert(id: string) {
  const record = getDemoState().alerts.find((a) => a.id === id)
  return transactDemo('alerts.review', record?.projectId, id, (state, actor) => {
    const alert = state.alerts.find((a) => a.id === id)
    if (!alert) throw new Error('Alert not found.')
    if (alert.lifecycleStatus === 'New') {
      alert.lifecycleStatus = 'Reviewed'
      history(state, id, 'Reviewed', 'Alert opened for review.', actor)
    }
  })
}
export function reviewRecommendation(id: string) {
  const record = getDemoState().recommendations.find((r) => r.id === id)
  const alert = getDemoState().alerts.find((a) => a.id === record?.alertId)
  return transactDemo('recommendations.review', alert?.projectId, id, (state, actor) => {
    const recommendation = state.recommendations.find((r) => r.id === id)
    if (!recommendation) throw new Error('Recommendation not found.')
    if (
      state.alerts.find((a) => a.id === recommendation.alertId)?.lifecycleStatus === 'Auto-resolved'
    ) {
      recommendation.reviewStatus = 'Actioned'
      history(state, id, 'Auto-resolved', 'Linked condition cleared.', actor)
      return
    }
    if (recommendation.reviewStatus === 'New') {
      recommendation.reviewStatus = 'Reviewed'
      history(state, id, 'Reviewed', 'Recommendation opened for review.', actor)
    }
  })
}
export const outcomeRecipients = (projectId: string, state = getDemoState()) =>
  state.accounts.filter(
    (a) =>
      a.status === 'Active' &&
      a.projectIds.includes(projectId) &&
      [
        'Project Manager',
        'Program Manager',
        'Monitoring and Evaluation Officer',
        'Project Officer',
      ].includes(a.role),
  )
export function decideAlert(id: string, outcome: RecommendationOutcome, note: string) {
  const record = getDemoState().alerts.find((a) => a.id === id)
  return transactDemo('outcomes.log', record?.projectId, id, (state, actor) => {
    if (!note.trim()) throw new Error('Enter an outcome note before confirming.')
    const alert = state.alerts.find((a) => a.id === id)
    if (!alert) throw new Error('Alert not found.')
    const statuses: AlertLifecycleStatus[] =
      outcome === 'Decline'
        ? ['Dismissed']
        : outcome === 'Escalate'
          ? ['Actioned']
          : ['Actioned', 'Resolved']
    for (const status of statuses) {
      alert.lifecycleStatus = status
      history(state, id, status, note, actor)
    }
    alert.actionNote = note
    for (const recipient of outcomeRecipients(alert.projectId, state))
      notifyLocally(
        state,
        recipient,
        `${alert.title}: ${outcome}. ${note}`,
        `/alerts?alert=${alert.id}`,
      )
    const recommendation = state.recommendations.find((r) => r.alertId === id)
    if (recommendation) {
      recommendation.outcome = outcome
      recommendation.outcomeNote = note
      recommendation.reviewStatus = 'Actioned'
    }
  })
}
export function decideRecommendation(id: string, outcome: RecommendationOutcome, note: string) {
  const recommendation = getDemoState().recommendations.find((r) => r.id === id)
  if (!recommendation) throw new Error('Recommendation not found.')
  const alert = getDemoState().alerts.find((a) => a.id === recommendation.alertId)
  return transactDemo('outcomes.log', alert?.projectId, id, (state, actor) => {
    if (!note.trim()) throw new Error('Enter a justification before confirming.')
    const rec = state.recommendations.find((r) => r.id === id)
    if (!rec) throw new Error('Recommendation not found.')
    const linked = state.alerts.find((a) => a.id === rec.alertId)
    if (!linked || linked.lifecycleStatus === 'Auto-resolved') {
      rec.reviewStatus = 'Actioned'
      history(state, id, 'Auto-resolved', 'Linked condition already cleared.', actor)
      return
    }
    rec.outcome = outcome
    rec.outcomeNote = note
    rec.reviewStatus = 'Actioned'
    const statuses: AlertLifecycleStatus[] =
      outcome === 'Decline'
        ? ['Dismissed']
        : outcome === 'Escalate'
          ? ['Actioned']
          : ['Actioned', 'Resolved']
    for (const status of statuses) {
      linked.lifecycleStatus = status
      history(state, linked.id, status, note, actor)
      history(state, id, status, note, actor)
    }
    for (const recipient of outcomeRecipients(linked.projectId, state))
      notifyLocally(
        state,
        recipient,
        `Recommendation decision: ${outcome}. ${note}`,
        `/recommendations?recommendation=${rec.id}`,
      )
  })
}
export const canOutcome = () => {
  const actor = currentAccount()
  return Boolean(actor && hasAction(actor.role, 'outcomes.log'))
}
