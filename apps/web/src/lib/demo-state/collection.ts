import { assertAction } from './permissions'
import {
  type DemoAccount,
  type DemoEntry,
  type DemoForm,
  type DemoState,
  demoTime,
  getDemoState,
  nextId,
  transactDemo,
} from './store'

export function saveForm(input: Omit<DemoForm, 'id' | 'responseCount'>, id?: string) {
  return transactDemo(id ? 'forms.edit' : 'forms.create', input.projectId, id, (state, actor) => {
    assertAction(actor, 'forms.publish', input.projectId)
    const existing = state.forms.find((f) => f.id === id)
    if (existing?.responseCount)
      throw new Error(
        'This form has collected data. Field-level editing is locked to protect existing records.',
      )
    if (
      !input.title.trim() ||
      !input.fields.length ||
      input.fields.some(
        (f) => !f.label.trim() || !f.type || (f.type.includes('select') && !f.options.length),
      )
    )
      throw new Error(
        'Complete the form title, fields, question types and choice options before publishing.',
      )
    const codes = input.fields.map((f) => f.code ?? f.id)
    if (new Set(codes).size !== codes.length) throw new Error('Field codes must be unique.')
    if (
      (input.indicatorIds ?? []).some(
        (i) =>
          !state.indicators.some(
            (record) => record.id === i && record.projectId === input.projectId,
          ),
      )
    )
      throw new Error('Choose indicators from the selected project.')
    const form = {
      ...input,
      id: id ?? nextId(state, 'form'),
      status: 'Published' as const,
      responseCount: 0,
    }
    state.forms = [...state.forms.filter((f) => f.id !== id), form]
    return form
  })
}
export function validateEntry(state: DemoState, input: Omit<DemoEntry, 'id'>): string[] {
  const errors: string[] = []
  if (!state.projects.some((p) => p.id === input.projectId && !p.archived))
    errors.push('Link the record to an available project.')
  if (!Number.isFinite(Date.parse(input.date))) errors.push('Enter a valid record date.')
  if (input.dataType !== 'project') {
    if (!state.activities.some((a) => a.id === input.activityId && a.projectId === input.projectId))
      errors.push('Select a valid activity in this project.')
    const beneficiary = state.beneficiaries.find(
      (b) => b.id === input.beneficiaryId || b.code === input.beneficiaryId,
    )
    if (!beneficiary || !beneficiary.projectIds.includes(input.projectId))
      errors.push('Participant is unlinked or unknown. Correct the participant/project linkage.')
    if (!['Present', 'Partial', 'Absent'].includes(input.values.attendance_status))
      errors.push('Attendance must be Present, Partial or Absent.')
  }
  for (const field of ['pre_test_score', 'post_test_score']) {
    const value = input.values[field]
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100))
      errors.push(`${field} must be from 0 to 100.`)
  }
  const form = state.forms.find((f) => f.id === input.formId)
  if (input.formId && (!form || form.status !== 'Published' || form.projectId !== input.projectId))
    errors.push('Choose a published form for this project.')
  if (form)
    for (const field of form.fields) {
      const value = input.values[field.code ?? field.id] ?? ''
      if (field.required && !value.trim()) errors.push(`${field.label} is required.`)
      if (
        value &&
        field.type === 'number' &&
        (!Number.isFinite(Number(value)) ||
          (field.min !== undefined && Number(value) < field.min) ||
          (field.max !== undefined && Number(value) > field.max))
      )
        errors.push(`${field.label} is outside its numeric validation rule.`)
      if (value && field.type === 'date' && !Number.isFinite(Date.parse(value)))
        errors.push(`${field.label} must be a valid date.`)
      if (value && field.type === 'single_select' && !field.options.includes(value))
        errors.push(`${field.label}: choose an available option.`)
    }
  return errors
}
export function duplicateEntry(state: DemoState, input: Omit<DemoEntry, 'id'>, id?: string) {
  return state.entries.some(
    (e) =>
      e.id !== id &&
      e.status === 'Submitted' &&
      e.projectId === input.projectId &&
      e.beneficiaryId === input.beneficiaryId &&
      e.activityId === input.activityId &&
      e.date === input.date,
  )
}
function integrateEntry(
  state: DemoState,
  input: Omit<DemoEntry, 'id'>,
  actor: DemoAccount,
  id?: string,
) {
  const entry: DemoEntry = { ...input, id: id ?? nextId(state, 'entry'), ownerId: actor.id }
  const beneficiary = state.beneficiaries.find(
    (b) => b.id === input.beneficiaryId || b.code === input.beneficiaryId,
  )
  if (beneficiary) entry.beneficiaryId = beneficiary.id
  state.entries = [...state.entries.filter((e) => e.id !== id), entry]
  if (input.status === 'Draft') return entry
  const form = state.forms.find((f) => f.id === input.formId)
  if (form) form.responseCount += 1
  const activity = state.activities.find((a) => a.id === input.activityId)
  if (beneficiary && activity) {
    beneficiary.participation.push({
      id: nextId(state, 'participation'),
      beneficiaryId: beneficiary.id,
      projectId: input.projectId,
      activityId: activity.id,
      participatedAt: input.date,
      attendanceStatus: input.values.attendance_status as 'Present' | 'Partial' | 'Absent',
      note: input.values.note ?? '',
    })
    for (const [field, title] of [
      ['pre_test_score', 'Pre-assessment'],
      ['post_test_score', 'Post-assessment'],
    ]) {
      if (input.values[field])
        beneficiary.assessments.push({
          id: nextId(state, 'assessment'),
          beneficiaryId: beneficiary.id,
          projectId: input.projectId,
          stageId: activity.journeyStageId,
          title,
          assessedAt: input.date,
          score: Number(input.values[field]),
          source: `${input.source} entry ${entry.id}`,
          note: input.values.note ?? '',
        })
    }
    activity.beneficiariesReached = new Set(
      state.beneficiaries
        .filter((b) =>
          b.participation.some(
            (p) => p.activityId === activity.id && p.attendanceStatus !== 'Absent',
          ),
        )
        .map((b) => b.id),
    ).size
    for (const indicator of state.indicators.filter((i) => activity.indicatorIds.includes(i.id)))
      indicator.actual = activity.beneficiariesReached
    const project = state.projects.find((p) => p.id === input.projectId)
    if (!project) throw new Error('Linked project is unavailable.')
    project.beneficiariesReached = state.beneficiaries.filter(
      (b) =>
        b.projectIds.includes(input.projectId) &&
        b.participation.some(
          (p) => p.projectId === input.projectId && p.attendanceStatus !== 'Absent',
        ),
    ).length
    beneficiary.notes.push({
      id: nextId(state, 'ripple'),
      beneficiaryId: beneficiary.id,
      projectId: input.projectId,
      stageId: activity.journeyStageId,
      author: actor.name,
      createdAt: demoTime(state),
      visibility: 'Internal',
      note: `${input.source} entry ${entry.id} → participation/assessment → indicator update → dashboard/report refresh.`,
    })
  }
  return entry
}
export function saveEntry(input: Omit<DemoEntry, 'id'>, id?: string, confirmDuplicate = false) {
  return transactDemo('entries.encode', input.projectId || undefined, id, (state, actor) => {
    const existing = state.entries.find((e) => e.id === id)
    if (id && (!existing || existing.ownerId !== actor.id || existing.status !== 'Draft'))
      throw new Error('Only your own draft can be resumed.')
    if (input.status === 'Submitted') {
      const errors = validateEntry(state, input)
      if (errors.length) throw new Error(errors.join(' '))
      if (duplicateEntry(state, input, id) && !confirmDuplicate)
        throw new Error('Duplicate participant record. Confirm saving or revise the record.')
    }
    return integrateEntry(state, input, actor, id)
  })
}
export function importEntries(
  projectId: string,
  filename: string,
  inputs: Omit<DemoEntry, 'id'>[],
  duplicateDecision: 'pending' | 'skip' | 'keep',
) {
  return transactDemo('imports.run', projectId, filename, (state, actor) => {
    if (state.scenario === 'import-failure')
      throw new Error('Import failed. Correct or retry the retained dataset.')
    const rejected: { row: number; errors: string[] }[] = []
    let accepted = 0
    inputs.forEach((input, index) => {
      if (input.projectId !== projectId)
        throw new Error('A row links to a different project. Correct its linkage before import.')
      const errors = validateEntry(state, input)
      if (errors.length) {
        rejected.push({ row: index + 1, errors })
        return
      }
      if (duplicateEntry(state, input)) {
        if (duplicateDecision === 'pending')
          throw new Error(
            'Duplicate records detected. Choose Skip duplicates or Keep confirmed duplicates before completing import.',
          )
        if (duplicateDecision === 'skip') {
          rejected.push({ row: index + 1, errors: ['Duplicate skipped by reviewer decision.'] })
          return
        }
      }
      integrateEntry(state, input, actor)
      accepted += 1
    })
    const summary = {
      id: nextId(state, 'import'),
      name: filename,
      accepted,
      rejected: rejected.length,
    }
    state.imports.push(summary)
    return { ...summary, issues: rejected }
  })
}
