/* @vitest-environment jsdom */
import type { FieldIntakeRule } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DisplayLabelsProvider } from '@/providers/display-labels-provider'

import type { FormField } from '../../collection.utils'
import { emptyIntake } from '../digital-form-contract'
import { AnswerKeyEditor } from './answer-key-editor'
import { CollectionWorkspace } from './collection-workspace'

const api = vi.hoisted(() => ({
  confirmDraftCheck: vi.fn(),
  getActivities: vi.fn(),
  getDigitalForms: vi.fn(),
  getIndicators: vi.fn(),
  getProjectsForRole: vi.fn(),
  updateDigitalForm: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['projects.read', 'forms.read', 'forms.manage', 'imports.read'],
    assignedProjectIds: ['project-1'],
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/providers/current-role-provider', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/api/forms', () => ({
  formsClient: {
    confirmDraftCheck: api.confirmDraftCheck,
    getDigitalForms: api.getDigitalForms,
    updateDigitalForm: api.updateDigitalForm,
  },
}))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: { getIndicators: api.getIndicators } }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: { getActivities: api.getActivities } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjectsForRole: api.getProjectsForRole },
}))

afterEach(cleanup)

type KeyRule = Extract<FieldIntakeRule, { kind: 'TOTAL_SCORE' }>

const field = (code: string, label: string, patch: Partial<FormField> = {}): FormField => ({
  id: code,
  label,
  code,
  type: 'text',
  required: false,
  metadataKey: false,
  sadddField: false,
  allowedValues: [],
  minimumValue: '',
  maximumValue: '',
  minimumLength: '',
  maximumLength: '',
  mappingStatus: 'mapped',
  ...emptyIntake,
  ...patch,
})
const fields = [
  field('stage_date', 'Date taken', { type: 'date' }),
  field('stage_consent', 'Consent', { type: 'boolean' }),
  field('first_name', 'First name'),
  field('last_name', 'Last name'),
  field('middle_name', 'Middle name'),
  field('external_identifier_value', 'Student ID'),
  field('q1', 'Colour of the sky', { type: 'single_select', allowedValues: ['Blue', 'Green'] }),
  field('q2', 'Capital city'),
  field('q3', 'Number of legs', { type: 'integer' }),
  field('total_score', 'Total score', { type: 'integer' }),
]

// Holds the rule the way the builder does, so a second change builds on the first.
const Harness = ({
  initial = null,
  disabled = false,
  onRule,
}: {
  initial?: KeyRule | null
  disabled?: boolean
  onRule: (rule: KeyRule | null) => void
}) => {
  const [rule, setRule] = useState(initial)
  return (
    <AnswerKeyEditor
      fields={fields}
      rule={rule}
      disabled={disabled}
      onChange={(next) => {
        setRule(next)
        onRule(next)
      }}
    />
  )
}
const choose = (question: string, mode: string) =>
  fireEvent.change(screen.getByLabelText(question), { target: { value: mode } })

describe('AnswerKeyEditor', () => {
  it('marks one correct answer', () => {
    const onRule = vi.fn()
    render(<Harness onRule={onRule} />)
    choose('Colour of the sky', 'answers')
    fireEvent.click(screen.getByLabelText('Green'))
    expect(onRule).toHaveBeenLastCalledWith({
      kind: 'TOTAL_SCORE',
      questions: [{ field: 'q1', answers: ['Green'] }],
    })
    choose('Capital city', 'answers')
    fireEvent.change(screen.getByLabelText('New correct answer for Capital city'), {
      target: { value: ' Manila ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add correct answer for Capital city' }))
    expect(onRule).toHaveBeenLastCalledWith({
      kind: 'TOTAL_SCORE',
      questions: [
        { field: 'q1', answers: ['Green'] },
        { field: 'q2', answers: ['Manila'] },
      ],
    })
  })

  it('any answer scores', () => {
    const onRule = vi.fn()
    render(<Harness onRule={onRule} />)
    choose('Capital city', 'any')
    expect(onRule).toHaveBeenLastCalledWith({
      kind: 'TOTAL_SCORE',
      questions: [{ field: 'q2', anyAnswer: true }],
    })
    expect(screen.queryByLabelText('New correct answer for Capital city')).toBeNull()
  })

  it('not scored leaves the question out', () => {
    const onRule = vi.fn()
    render(
      <Harness
        onRule={onRule}
        initial={{
          kind: 'TOTAL_SCORE',
          questions: [
            { field: 'q1', answers: ['Blue'] },
            { field: 'q2', anyAnswer: true },
          ],
        }}
      />,
    )
    expect((screen.getByLabelText('Colour of the sky') as HTMLSelectElement).value).toBe('answers')
    expect((screen.getByLabelText('Blue') as HTMLInputElement).checked).toBe(true)
    choose('Colour of the sky', 'none')
    expect(onRule).toHaveBeenLastCalledWith({
      kind: 'TOTAL_SCORE',
      questions: [{ field: 'q2', anyAnswer: true }],
    })
    choose('Capital city', 'none')
    expect(onRule).toHaveBeenLastCalledWith(null)
  })

  it('identity fields are not offered', () => {
    render(<Harness onRule={vi.fn()} />)
    for (const label of [
      'Date taken',
      'Consent',
      'First name',
      'Last name',
      'Middle name',
      'Student ID',
      'Total score',
    ])
      expect(screen.queryByLabelText(label)).toBeNull()
    expect(screen.getAllByRole('combobox')).toHaveLength(3)
  })

  it('offers correct answers only where an answer can match', () => {
    render(<Harness onRule={vi.fn()} />)
    const modes = (label: string) =>
      within(screen.getByLabelText(label))
        .getAllByRole('option')
        .map((option) => option.getAttribute('value'))
    expect(modes('Colour of the sky')).toEqual(['none', 'any', 'answers'])
    expect(modes('Number of legs')).toEqual(['none', 'any'])
  })

  it('read-only on a published form', () => {
    render(
      <Harness
        disabled
        onRule={vi.fn()}
        initial={{ kind: 'TOTAL_SCORE', questions: [{ field: 'q1', answers: ['Blue'] }] }}
      />,
    )
    const controls = [
      ...screen.getAllByRole('combobox'),
      ...screen.getAllByRole('checkbox'),
      ...screen.queryAllByRole('textbox'),
      ...screen.queryAllByRole('button'),
    ]
    expect(controls.length).toBeGreaterThan(3)
    for (const control of controls) expect((control as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Blue') as HTMLInputElement).checked).toBe(true)
  })

  it('keyboard reachable with labelled controls', () => {
    render(
      <Harness
        onRule={vi.fn()}
        initial={{
          kind: 'TOTAL_SCORE',
          questions: [
            { field: 'q1', answers: ['Blue'] },
            { field: 'q2', answers: ['Manila'] },
          ],
        }}
      />,
    )
    const controls = document.querySelectorAll<HTMLElement>('select, input, button')
    expect(controls.length).toBeGreaterThan(6)
    for (const control of controls) {
      expect(control.tabIndex).toBeGreaterThanOrEqual(0)
      const named =
        control.getAttribute('aria-label') ||
        (control as HTMLInputElement).labels?.length ||
        control.textContent
      expect(named, control.outerHTML).toBeTruthy()
    }
    expect(
      screen.getByRole('group', { name: /Correct answers for Colour of the sky/ }),
    ).toBeTruthy()
  })
})

describe('saving the answer key', () => {
  const summary = {
    addedFields: ['stage_date', 'total_score'],
    sourceNamesAdded: [],
    optionsAdded: [],
    aliasesAdded: 0,
    defaults: [],
    rules: [],
    needsCheck: [{ fieldCode: 'total_score', reason: 'ANSWER_KEY_NEEDED' }],
  }
  const api_field = (code: string, label: string, dataType: string, extra = {}) => ({
    id: `id-${code}`,
    code,
    label,
    dataType,
    required: false,
    metadataKey: false,
    sadddField: false,
    ...extra,
  })
  const draft = {
    id: 'draft-1',
    projectId: 'project-1',
    code: 'stage_lst',
    version: 1,
    name: 'LST Survey',
    formType: 'TRAINING_SURVEY',
    status: 'DRAFT',
    activityId: null,
    journeyStageId: null,
    updatedAt: '2026-10-23T00:00:00Z',
    createdByCurrentUser: true,
    draftSummary: summary,
    fields: [
      api_field('stage_date', 'Date taken', 'DATE'),
      api_field('q1', 'Colour of the sky', 'SELECT', { allowedValues: ['Blue', 'Green'] }),
      api_field('total_score', 'Total score', 'INTEGER'),
    ],
  }
  const keyed = {
    kind: 'TOTAL_SCORE',
    questions: [{ field: 'q1', answers: ['Green'] }],
  }
  const open = () =>
    render(
      <DisplayLabelsProvider>
        <CollectionWorkspace
          initialProjectId="project-1"
          initialFormId="draft-1"
          initialView="builder"
        />
      </DisplayLabelsProvider>,
    )
  const mark = async () => {
    Element.prototype.scrollIntoView = vi.fn()
    fireEvent.click(await screen.findByRole('button', { name: 'Go to total_score' }))
    choose('Colour of the sky', 'answers')
    fireEvent.click(screen.getByLabelText('Green'))
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft', hidden: false }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    api.getProjectsForRole.mockResolvedValue([{ id: 'project-1', title: 'Project' }])
    api.getDigitalForms.mockResolvedValue([draft])
    api.getActivities.mockResolvedValue([])
    api.getIndicators.mockResolvedValue([])
  })

  it('saving clears the needs check', async () => {
    const saved = {
      ...draft,
      updatedAt: '2026-10-24T00:00:00Z',
      fields: draft.fields.map((item) =>
        item.code === 'total_score' ? { ...item, rule: keyed } : item,
      ),
    }
    api.updateDigitalForm.mockResolvedValue(saved)
    api.confirmDraftCheck.mockResolvedValue({
      ...saved,
      updatedAt: '2026-10-25T00:00:00Z',
      draftSummary: { ...summary, needsCheck: [] },
    })
    open()
    await mark()
    await waitFor(() => expect(api.confirmDraftCheck).toHaveBeenCalled())
    const sent = api.updateDigitalForm.mock.calls[0][2]
    expect(sent.fields.find((item: { code: string }) => item.code === 'total_score').rule).toEqual(
      keyed,
    )
    expect(api.confirmDraftCheck).toHaveBeenCalledWith(
      'project-1',
      'draft-1',
      'total_score',
      '2026-10-24T00:00:00Z',
    )
    await waitFor(() => expect(screen.queryByText('Needs check')).toBeNull())
  })

  it('keeps the item and says so when the check cannot be cleared after the save', async () => {
    api.updateDigitalForm.mockResolvedValue({
      ...draft,
      updatedAt: '2026-10-24T00:00:00Z',
      fields: draft.fields.map((item) =>
        item.code === 'total_score' ? { ...item, rule: keyed } : item,
      ),
    })
    api.confirmDraftCheck.mockRejectedValue(new Error('Form changed; reload before saving.'))
    open()
    await mark()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Form changed; reload before saving.'),
    )
    expect(screen.getAllByText('Needs check').length).toBeGreaterThan(0)
  })

  it('does not clear the item when no question is scored', async () => {
    api.updateDigitalForm.mockResolvedValue({ ...draft, updatedAt: '2026-10-24T00:00:00Z' })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Go to total_score' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft', hidden: false }))
    await waitFor(() => expect(api.updateDigitalForm).toHaveBeenCalled())
    expect(api.confirmDraftCheck).not.toHaveBeenCalled()
  })
})
