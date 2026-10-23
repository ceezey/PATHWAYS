import { describe, expect, it } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { type FormRow, mapForm } from './metadata.mapper'

const summary = {
  addedFields: ['given_name'],
  sourceNamesAdded: [],
  optionsAdded: [],
  aliasesAdded: 2,
  defaults: [],
  rules: [],
  needsCheck: [{ fieldCode: 'given_name', reason: 'SUGGESTED_SOURCE_NAME' }],
}
const actor = { userId: 'u1' } as ApplicationIdentity
const form = (patch: Partial<FormRow>) =>
  ({
    id: 'f1',
    projectId: 'p1',
    code: 'registration',
    version: 2,
    name: 'Registration',
    description: null,
    formType: 'OTHER',
    status: 'DRAFT',
    activityId: null,
    journeyStageId: null,
    createdById: 'u2',
    lastEditedById: 'u2',
    importDraftSummary: summary,
    publishedAt: null,
    archivedAt: null,
    updatedAt: new Date('2026-10-23T00:00:00Z'),
    formField_form: [],
    ...patch,
  }) as unknown as FormRow

describe('mapForm draft summary', () => {
  it('returns the stored summary for a draft, whoever reads it', () => {
    expect(mapForm(form({}), actor).draftSummary).toEqual(summary)
  })

  it('is null for a published or archived form, a draft without one and a malformed one', () => {
    for (const patch of [
      { status: 'PUBLISHED' as const },
      { status: 'ARCHIVED' as const },
      { importDraftSummary: null },
      { importDraftSummary: { addedFields: 'x' } },
    ]) {
      expect(mapForm(form(patch), actor).draftSummary).toBeNull()
    }
  })
})
