import { ConflictException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { publishFormVersion } from './form-versions.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const drafterId = '20000000-0000-4000-8000-000000000002'
const reviewerId = '20000000-0000-4000-8000-000000000003'
const projectId = '30000000-0000-4000-8000-000000000003'
const formId = '40000000-0000-4000-8000-000000000004'
const activityId = 'a1000000-0000-4000-8000-000000000001'
const stageId = 'b1000000-0000-4000-8000-000000000001'
const now = new Date('2026-10-22T10:00:00.000Z')

const actor = (userId: string): ApplicationIdentity => ({
  id: '80000000-0000-4000-8000-000000000008',
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['forms.read', 'forms.manage', 'forms.publish'],
  assignedProjectIds: [projectId],
})

const field = (code: string, dataType: 'DATE' | 'INTEGER', index: number) => ({
  id: `50000000-0000-4000-8000-00000000000${index}`,
  code,
  label: code,
  dataType,
  isRequired: false,
  isMetadataKey: false,
  isSadddField: false,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  sourceNames: [] as string[],
  valueAliases: null,
  importDefault: null,
  rule: null,
  sequenceNo: index,
})

const keyNeeded = { fieldCode: 'total_score', reason: 'ANSWER_KEY_NEEDED' }
const stageForm = (patch: Record<string, unknown> = {}) => ({
  id: formId,
  projectId,
  code: 'stage_lst',
  version: 1,
  name: 'LST Survey',
  description: null,
  formType: 'TRAINING_SURVEY',
  status: 'DRAFT',
  activityId,
  journeyStageId: stageId,
  createdById: drafterId,
  lastEditedById: drafterId,
  importDraftSummary: null as unknown,
  publishedAt: null,
  archivedAt: null,
  updatedAt: now,
  formField_form: [field('stage_date', 'DATE', 1), field('total_score', 'INTEGER', 2)],
  ...patch,
})
const summary = (needsCheck: unknown[]) => ({
  addedFields: ['stage_date', 'total_score'],
  sourceNamesAdded: [],
  optionsAdded: [],
  aliasesAdded: 0,
  defaults: [],
  rules: [],
  needsCheck,
})

describe('publish gates of a stage survey', () => {
  const tx = {
    project: { findFirst: vi.fn() },
    digitalForm: { findFirst: vi.fn(), updateMany: vi.fn() },
    activityJourneyStageMapping: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const cache = { evictForm: vi.fn() }
  const publish = (by = reviewerId) =>
    publishFormVersion(
      tx as unknown as Tx,
      actor(by),
      projectId,
      formId,
      { expectedUpdatedAt: now.toISOString() },
      cache as never,
    )

  beforeEach(() => {
    vi.clearAllMocks()
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.activityJourneyStageMapping.findFirst.mockResolvedValue({ id: 'mapping' })
    tx.digitalForm.updateMany.mockResolvedValue({ count: 1 })
  })

  it('total score with values and no key cannot publish', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      stageForm({ importDraftSummary: summary([keyNeeded]) }),
    )
    await expect(publish()).rejects.toMatchObject({
      message: 'Mark the correct answers for the total score first.',
    })
    await expect(publish()).rejects.toBeInstanceOf(ConflictException)
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
  })

  it('empty total score column can publish with no key', async () => {
    tx.digitalForm.findFirst
      .mockResolvedValueOnce(stageForm({ importDraftSummary: summary([]) }))
      .mockResolvedValueOnce(stageForm({ status: 'PUBLISHED' }))
    await publish()
    expect(tx.digitalForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) }),
    )
  })

  it('stage form without an activity cannot publish', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(
      stageForm({ importDraftSummary: summary([]), activityId: null }),
    )
    await expect(publish()).rejects.toMatchObject({
      message: 'This survey needs an activity and a journey stage.',
    })
    tx.digitalForm.findFirst.mockResolvedValue(stageForm({ importDraftSummary: summary([]) }))
    tx.activityJourneyStageMapping.findFirst.mockResolvedValue(null)
    await expect(publish()).rejects.toMatchObject({
      message: 'This survey needs an activity and a journey stage.',
    })
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
  })

  it('drafter cannot publish a stage form', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(stageForm({ importDraftSummary: summary([]) }))
    await expect(publish(drafterId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.digitalForm.updateMany).not.toHaveBeenCalled()
  })

  it('a form without a stage date is not gated', async () => {
    tx.digitalForm.findFirst
      .mockResolvedValueOnce(
        stageForm({ activityId: null, formField_form: [field('total_score', 'INTEGER', 2)] }),
      )
      .mockResolvedValueOnce(stageForm({ status: 'PUBLISHED' }))
    await publish()
    expect(tx.activityJourneyStageMapping.findFirst).not.toHaveBeenCalled()
  })
})
