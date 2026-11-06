import { digitalFormTypes } from '@pathways/shared'
import { describe, expect, it, vi } from 'vitest'

import { type BuilderFormField, emptyIntake } from './digital-form-contract'
import {
  type FormBuilderSessionDraft,
  clearFormBuilderSessionDraft,
  formBuilderSessionDraftKey,
  readFormBuilderSessionDraft,
  writeFormBuilderSessionDraft,
} from './form-builder-session-draft'

const field: BuilderFormField = {
  id: 'field-1',
  label: 'Enrollment date',
  code: 'enrollment_date',
  type: 'date',
  required: true,
  metadataKey: false,
  sadddField: false,
  allowedValues: [],
  minimumValue: '',
  maximumValue: '',
  minimumLength: '',
  maximumLength: '',
  mappingStatus: 'mapped',
  ...emptyIntake,
}

const draft: FormBuilderSessionDraft = {
  schemaVersion: 2,
  baseUpdatedAt: '2026-09-20T10:00:00.000Z',
  mode: 'scratch',
  view: 'builder',
  formTitle: 'Registration',
  formCode: 'registration',
  formType: 'BENEFICIARY_REGISTRATION',
  projectId: '30000000-0000-4000-8000-000000000003',
  journeyStage: '',
  linkedActivityId: '',
  fields: [field],
  selectedFieldId: field.id,
}

const scope = {
  organizationId: 'org-1',
  userId: 'user-1',
  projectId: draft.projectId,
  resourceId: 'form-1',
}
const storage = () => {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  }
}

describe('form builder session draft', () => {
  it('round-trips a bounded user/form-scoped draft and clears it explicitly', () => {
    const target = storage()
    const key = formBuilderSessionDraftKey(scope)
    writeFormBuilderSessionDraft(target, key, draft)
    expect(readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId)).toEqual(
      draft,
    )
    clearFormBuilderSessionDraft(target, key)
    expect(
      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId),
    ).toBeNull()
  })

  it('rejects stale, malformed and structurally unsafe browser values', () => {
    const target = storage()
    const key = formBuilderSessionDraftKey(scope)
    writeFormBuilderSessionDraft(target, key, draft)
    expect(
      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, 'different-project'),
    ).toBeNull()
    expect(
      readFormBuilderSessionDraft(target, key, '2026-09-20T11:00:00.000Z', draft.projectId),
    ).toBeNull()
    target.setItem(key, '{bad json')
    expect(
      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId),
    ).toBeNull()
    target.setItem(key, JSON.stringify({ ...draft, fields: [{ __proto__: { polluted: true } }] }))
    expect(
      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId),
    ).toBeNull()
  })

  it('keeps a half-filled rule and refuses malformed intake metadata', () => {
    const target = storage()
    const key = formBuilderSessionDraftKey(scope)
    const intake = {
      ...field,
      sourceNames: ['Enrolled on'],
      rule: { kind: 'AGE_AT_DATE' as const, birthField: '', atField: '' },
    }
    writeFormBuilderSessionDraft(target, key, { ...draft, fields: [intake] })
    expect(
      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId)?.fields[0],
    ).toEqual(intake)
    for (const bad of [
      { sourceNames: 'x' },
      { valueAliases: [{ from: 'a' }] },
      { importDefault: 3 },
      { rule: { kind: 'RUN_CODE' } },
    ]) {
      target.setItem(key, JSON.stringify({ ...draft, fields: [{ ...field, ...bad }] }))
      expect(
        readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId),
      ).toBeNull()
    }
  })

  it('does not throw when browser storage is unavailable', () => {
    const unavailable = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      removeItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }
    const key = formBuilderSessionDraftKey({ ...scope, resourceId: null })
    expect(() => writeFormBuilderSessionDraft(unavailable, key, draft)).not.toThrow()
    expect(
      readFormBuilderSessionDraft(unavailable, key, draft.baseUpdatedAt, draft.projectId),
    ).toBeNull()
    expect(() => clearFormBuilderSessionDraft(unavailable, key)).not.toThrow()
  })

  it('does not recover untouched new-form state as an unsaved edit', () => {
    const target = storage()
    const key = formBuilderSessionDraftKey({ ...scope, resourceId: null })
    writeFormBuilderSessionDraft(target, key, {
      ...draft,
      baseUpdatedAt: null,
      fields: [],
      formTitle: '',
      formCode: '',
    })
    expect(target.getItem(key)).toBeNull()
    expect(readFormBuilderSessionDraft(target, key, null, draft.projectId)).toBeNull()
  })

  it.each(digitalFormTypes)('keeps a draft of the %s form type', (formType) => {
    const target = storage()
    const key = formBuilderSessionDraftKey(scope)
    writeFormBuilderSessionDraft(target, key, { ...draft, formType })
    expect(
      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId)?.formType,
    ).toBe(formType)
  })

  it('drops a draft whose form type is not one the API defines', () => {
    const target = storage()
    const key = formBuilderSessionDraftKey(scope)
    writeFormBuilderSessionDraft(target, key, { ...draft, formType: 'SURVEY' as never })
    expect(target.getItem(key)).not.toBeNull()
    expect(
      readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt, draft.projectId),
    ).toBeNull()
  })
})
