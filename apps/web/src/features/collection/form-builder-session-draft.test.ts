import { describe, expect, it, vi } from 'vitest'

import type { BuilderFormField } from './digital-form-contract'
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
  allowedValues: '',
  minimumValue: '',
  maximumValue: '',
  minimumLength: '',
  maximumLength: '',
  mappingStatus: 'mapped',
}

const draft: FormBuilderSessionDraft = {
  schemaVersion: 1,
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
    const key = formBuilderSessionDraftKey('user-1', 'form-1')
    writeFormBuilderSessionDraft(target, key, draft)
    expect(readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt)).toEqual(draft)
    clearFormBuilderSessionDraft(target, key)
    expect(readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt)).toBeNull()
  })

  it('rejects stale, malformed and structurally unsafe browser values', () => {
    const target = storage()
    const key = formBuilderSessionDraftKey('user-1', 'form-1')
    writeFormBuilderSessionDraft(target, key, draft)
    expect(readFormBuilderSessionDraft(target, key, '2026-09-20T11:00:00.000Z')).toBeNull()
    target.setItem(key, '{bad json')
    expect(readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt)).toBeNull()
    target.setItem(key, JSON.stringify({ ...draft, fields: [{ __proto__: { polluted: true } }] }))
    expect(readFormBuilderSessionDraft(target, key, draft.baseUpdatedAt)).toBeNull()
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
    const key = formBuilderSessionDraftKey('user-1', null)
    expect(() => writeFormBuilderSessionDraft(unavailable, key, draft)).not.toThrow()
    expect(readFormBuilderSessionDraft(unavailable, key, draft.baseUpdatedAt)).toBeNull()
    expect(() => clearFormBuilderSessionDraft(unavailable, key)).not.toThrow()
  })
})
