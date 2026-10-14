import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import {
  type FormVersionRequest,
  type UpdateFormRequest,
  activityMonitoringDefinitionErrors,
  beneficiaryRegistrationDefinitionErrors,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { findForm, requireForm, requireLinks } from './form-lookup.service'
import { expectedDate, fieldData } from './metadata.helpers'
import {
  type CachedFormDefinition,
  type FormRow,
  fieldInput,
  formFieldContract,
  mapForm,
} from './metadata.mapper'
import type { PublishedDefinitionCache } from './published-definition-cache'

export async function updateFormDefinition(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  input: UpdateFormRequest,
  cache: PublishedDefinitionCache<CachedFormDefinition>,
) {
  const current = await requireForm(tx, actor, projectId, formId)
  cache.evictForm(current.id)
  if (current.status !== 'DRAFT') {
    return createVersion(tx, actor, current, input)
  }
  const expected = expectedDate(input.expectedUpdatedAt)
  await requireLinks(tx, actor, current.projectId, input.activityId, input.journeyStageId)
  const changed = await tx.digitalForm.updateMany({
    where: {
      id: current.id,
      organizationId: actor.organizationId,
      projectId: current.projectId,
      status: 'DRAFT',
      updatedAt: expected,
    },
    data: {
      code: input.code,
      name: input.name,
      description: input.description?.trim() || null,
      formType: input.formType,
      activityId: input.activityId?.toLowerCase() || null,
      journeyStageId: input.journeyStageId?.toLowerCase() || null,
    },
  })
  if (changed.count !== 1) throw new ConflictException('Form changed; reload before saving.')
  await tx.formField.deleteMany({
    where: {
      organizationId: actor.organizationId,
      projectId: current.projectId,
      formId: current.id,
    },
  })
  await tx.formField.createMany({
    data: fieldData(actor.organizationId, current.projectId, current.id, input.fields),
  })
  await writeAuditLog(tx, actor, {
    projectId: current.projectId,
    action: 'FORM_DRAFT_UPDATED',
    entityType: 'DigitalForm',
    entityId: current.id,
    changes: { version: current.version, fieldCount: input.fields.length },
  })
  return mapForm(await findForm(tx, actor, current.projectId, current.id), actor)
}

export async function publishFormVersion(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  input: FormVersionRequest,
  cache: PublishedDefinitionCache<CachedFormDefinition>,
) {
  const current = await requireForm(tx, actor, projectId, formId)
  cache.evictForm(current.id)
  if (current.status !== 'DRAFT') throw new ConflictException('Only a draft can be published.')
  if (current.createdById === actor.userId) {
    throw new ForbiddenException('A form author cannot approve and publish the same version.')
  }
  const validation = validateAndNormalizeFormData(
    current.formField_form.map(formFieldContract),
    {},
    'draft',
  )
  const registrationErrors =
    current.formType === 'BENEFICIARY_REGISTRATION'
      ? beneficiaryRegistrationDefinitionErrors(current.formField_form.map(formFieldContract))
      : []
  const activityMonitoringErrors =
    current.formType === 'ACTIVITY_MONITORING'
      ? activityMonitoringDefinitionErrors(current.formField_form.map(formFieldContract))
      : []
  const bindingErrors: Array<{ fieldCode: string; code: string; message: string }> = []
  if (current.formType === 'ACTIVITY_MONITORING') {
    if (!current.activityId) {
      bindingErrors.push({
        fieldCode: 'activity_id',
        code: 'invalid_definition',
        message: 'Activity monitoring forms must be bound to one project activity.',
      })
    }
    if (!current.journeyStageId) {
      bindingErrors.push({
        fieldCode: 'journey_stage_id',
        code: 'invalid_definition',
        message: 'Activity monitoring forms must be bound to one journey stage.',
      })
    }
    if (current.activityId && current.journeyStageId) {
      const mapping = await tx.activityJourneyStageMapping.findFirst({
        where: {
          organizationId: actor.organizationId,
          projectId: current.projectId,
          activityId: current.activityId,
          stageId: current.journeyStageId,
        },
        select: { id: true },
      })
      if (!mapping) {
        bindingErrors.push({
          fieldCode: 'journey_stage_id',
          code: 'invalid_definition',
          message: 'The selected journey stage must be mapped to the selected activity.',
        })
      }
    }
  }
  const definitionErrors = [
    ...validation.errors,
    ...registrationErrors,
    ...activityMonitoringErrors,
    ...bindingErrors,
  ]
  if (definitionErrors.length > 0) {
    throw new BadRequestException({
      message: 'Form definition is invalid.',
      errors: definitionErrors,
    })
  }
  const expected = expectedDate(input.expectedUpdatedAt)
  const now = new Date()
  const changed = await tx.digitalForm.updateMany({
    where: {
      id: current.id,
      organizationId: actor.organizationId,
      projectId: current.projectId,
      status: 'DRAFT',
      updatedAt: expected,
    },
    data: { status: 'PUBLISHED', publishedById: actor.userId, publishedAt: now },
  })
  if (changed.count !== 1) throw new ConflictException('Form changed; reload before publishing.')
  await writeAuditLog(tx, actor, {
    projectId: current.projectId,
    action: 'FORM_PUBLISHED',
    entityType: 'DigitalForm',
    entityId: current.id,
    changes: { code: current.code, version: current.version },
  })
  return mapForm(await findForm(tx, actor, current.projectId, current.id), actor)
}

export async function archiveFormVersion(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  input: FormVersionRequest,
  cache: PublishedDefinitionCache<CachedFormDefinition>,
) {
  const current = await requireForm(tx, actor, projectId, formId)
  cache.evictForm(current.id)
  if (current.status === 'ARCHIVED') return mapForm(current, actor)
  const expected = expectedDate(input.expectedUpdatedAt)
  const changed = await tx.digitalForm.updateMany({
    where: {
      id: current.id,
      organizationId: actor.organizationId,
      projectId: current.projectId,
      status: current.status,
      updatedAt: expected,
    },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  })
  if (changed.count !== 1) throw new ConflictException('Form changed; reload before archiving.')
  await writeAuditLog(tx, actor, {
    projectId: current.projectId,
    action: 'FORM_ARCHIVED',
    entityType: 'DigitalForm',
    entityId: current.id,
    changes: { code: current.code, version: current.version },
  })
  return mapForm(await findForm(tx, actor, current.projectId, current.id), actor)
}

export async function createNextFormVersion(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
) {
  const current = await requireForm(tx, actor, projectId, formId)
  if (current.status === 'DRAFT') {
    throw new ConflictException('Finish the current draft before creating another version.')
  }
  return createVersion(tx, actor, current)
}

async function createVersion(
  tx: Tx,
  actor: ApplicationIdentity,
  sourceForm: FormRow,
  override?: UpdateFormRequest,
) {
  await tx.$queryRaw`
      SELECT id FROM pathways.digital_forms
      WHERE id=${sourceForm.id}::uuid AND organization_id=${actor.organizationId}::uuid
        AND project_id=${sourceForm.projectId}::uuid
      FOR UPDATE
    `
  const source = await findForm(tx, actor, sourceForm.projectId, sourceForm.id)
  if (override) {
    if (expectedDate(override.expectedUpdatedAt).valueOf() !== source.updatedAt.valueOf()) {
      throw new ConflictException('Form changed; reload before creating a version.')
    }
    if (override.code !== source.code) {
      throw new BadRequestException('A form code cannot change between versions.')
    }
  }
  const latest = await tx.digitalForm.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: source.projectId,
      code: source.code,
    },
    select: { id: true, version: true, status: true },
    orderBy: { version: 'desc' },
  })
  if (!latest || latest.id !== source.id || latest.status === 'DRAFT') {
    throw new ConflictException('A newer form version already exists; open that version instead.')
  }
  const version = latest.version + 1
  if (override) {
    await requireLinks(tx, actor, source.projectId, override.activityId, override.journeyStageId)
  }
  let created: { id: string }
  try {
    created = await tx.digitalForm.create({
      data: {
        organizationId: actor.organizationId,
        projectId: source.projectId,
        code: source.code,
        version,
        name: override?.name ?? source.name,
        description:
          override === undefined ? source.description : override.description?.trim() || null,
        formType: override?.formType ?? source.formType,
        activityId:
          override === undefined ? source.activityId : override.activityId?.toLowerCase() || null,
        journeyStageId:
          override === undefined
            ? source.journeyStageId
            : override.journeyStageId?.toLowerCase() || null,
        createdById: actor.userId,
      },
      select: { id: true },
    })
  } catch (caught) {
    if ((caught as { code?: string }).code === 'P2002') {
      throw new ConflictException('Another form version was created; reload before editing.')
    }
    throw caught
  }
  const fields = override?.fields ?? source.formField_form.map(fieldInput)
  await tx.formField.createMany({
    data: fieldData(actor.organizationId, source.projectId, created.id, fields),
  })
  await writeAuditLog(tx, actor, {
    projectId: source.projectId,
    action: 'FORM_VERSION_CREATED',
    entityType: 'DigitalForm',
    entityId: created.id,
    changes: {
      code: source.code,
      fromVersion: source.version,
      version,
      fieldCount: fields.length,
    },
  })
  return mapForm(await findForm(tx, actor, source.projectId, created.id), actor)
}
