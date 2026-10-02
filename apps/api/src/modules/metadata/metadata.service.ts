import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import {
  type FormFieldValidationContract,
  type FormValidationMode,
  activityMonitoringDefinitionErrors,
  beneficiaryRegistrationDefinitionErrors,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import { ParticipantsService } from '../participants/participants.service'
import { type FormTemplateKey, formTemplates } from './form-templates'
import type {
  CreateFormDto,
  ExpectedVersionDto,
  GenerateFormDto,
  ListSubmissionsQueryDto,
  SaveSubmissionDto,
  SubmitSubmissionDto,
  UpdateFormDto,
  UpdateSubmissionDto,
} from './metadata.dto'
import { PublishedDefinitionCache } from './published-definition-cache'

type Tx = Prisma.TransactionClient

// V4-C11: direct entry stays only for survey, test and activity-monitoring forms.
export const DIRECT_ENTRY_FORM_TYPES = [
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'ACTIVITY_MONITORING',
] as const

const fieldSelection = {
  id: true,
  code: true,
  label: true,
  dataType: true,
  isRequired: true,
  isMetadataKey: true,
  isSadddField: true,
  allowedValues: true,
  minimumValue: true,
  maximumValue: true,
  minimumDate: true,
  maximumDate: true,
  minimumLength: true,
  maximumLength: true,
  sequenceNo: true,
} satisfies Prisma.FormFieldSelect

const formSelection = {
  id: true,
  projectId: true,
  code: true,
  version: true,
  name: true,
  description: true,
  formType: true,
  status: true,
  activityId: true,
  journeyStageId: true,
  createdById: true,
  publishedAt: true,
  archivedAt: true,
  updatedAt: true,
  formField_form: { select: fieldSelection, orderBy: { sequenceNo: 'asc' as const } },
} satisfies Prisma.DigitalFormSelect

type FormRow = Prisma.DigitalFormGetPayload<{ select: typeof formSelection }>

function allowedValues(value: Prisma.JsonValue | null) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

function contract(field: FormRow['formField_form'][number]): FormFieldValidationContract {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    allowedValues: allowedValues(field.allowedValues),
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
  }
}

function mapForm(form: FormRow, actor: ApplicationIdentity) {
  return {
    id: form.id,
    projectId: form.projectId,
    code: form.code,
    version: form.version,
    name: form.name,
    description: form.description,
    formType: form.formType,
    status: form.status,
    activityId: form.activityId,
    journeyStageId: form.journeyStageId,
    publishedAt: form.publishedAt?.toISOString(),
    archivedAt: form.archivedAt?.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
    createdByCurrentUser: form.createdById === actor.userId,
    fields: form.formField_form.map((field) => ({
      id: field.id,
      code: field.code,
      label: field.label,
      dataType: field.dataType,
      required: field.isRequired,
      metadataKey: field.isMetadataKey,
      sadddField: field.isSadddField,
      allowedValues: allowedValues(field.allowedValues),
      minimumValue: field.minimumValue?.toString(),
      maximumValue: field.maximumValue?.toString(),
      minimumDate: field.minimumDate?.toISOString().slice(0, 10),
      maximumDate: field.maximumDate?.toISOString().slice(0, 10),
      minimumLength: field.minimumLength,
      maximumLength: field.maximumLength,
      sequence: field.sequenceNo,
    })),
  }
}

function fieldInput(field: FormRow['formField_form'][number]): CreateFormDto['fields'][number] {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    metadataKey: field.isMetadataKey,
    sadddField: field.isSadddField,
    allowedValues: allowedValues(field.allowedValues) ?? undefined,
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength ?? undefined,
    maximumLength: field.maximumLength ?? undefined,
  }
}

function assertDefinition(input: CreateFormDto) {
  const result = validateAndNormalizeFormData(
    input.fields.map((field) => ({ ...field, required: field.required })),
    {},
    'draft',
  )
  if (!result.valid) {
    throw new BadRequestException({ message: 'Form definition is invalid.', errors: result.errors })
  }
}

function fieldData(
  organizationId: string,
  projectId: string,
  formId: string,
  fields: CreateFormDto['fields'],
): Prisma.FormFieldCreateManyInput[] {
  return fields.map((field, index) => ({
    organizationId,
    projectId,
    formId,
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    isRequired: field.required,
    isMetadataKey: field.metadataKey,
    isSadddField: field.sadddField,
    allowedValues: field.allowedValues?.map((item) => item.trim()) ?? Prisma.DbNull,
    minimumValue: field.minimumValue,
    maximumValue: field.maximumValue,
    minimumDate: field.minimumDate ? new Date(`${field.minimumDate}T00:00:00.000Z`) : undefined,
    maximumDate: field.maximumDate ? new Date(`${field.maximumDate}T00:00:00.000Z`) : undefined,
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
    sequenceNo: index + 1,
  }))
}

function sameValues(
  left: Record<string, string | number | boolean | string[] | null>,
  right: Record<string, string | number | boolean | string[] | null>,
) {
  const stable = (value: typeof left) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))))
  return stable(left) === stable(right)
}

@Injectable()
export class MetadataService {
  private readonly publishedDefinitions = new PublishedDefinitionCache<{
    fingerprint: string
    value: ReturnType<typeof mapForm>
  }>()
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  listForms(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.read', async (tx, actor) => {
      const id = await this.requireProject(tx, actor, projectId)
      const rows = await tx.digitalForm.findMany({
        where: { organizationId: actor.organizationId, projectId: id },
        select: formSelection,
        orderBy: [{ code: 'asc' }, { version: 'desc' }],
        take: 100,
      })
      return rows.map((row) => mapForm(row, actor))
    })
  }

  getForm(identity: ApplicationIdentity, projectId: string, formId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.read', async (tx, actor) => {
      const scopedProjectId = await this.requireProject(tx, actor, projectId)
      if (!UUID_PATTERN.test(formId)) throw new NotFoundException('Form unavailable.')
      const id = formId.toLowerCase()
      const key = JSON.stringify([
        actor.id,
        actor.organizationId,
        actor.userId,
        actor.aal,
        [...actor.roles].sort(),
        [...actor.permissions].sort(),
        [...actor.assignedProjectIds].sort(),
        scopedProjectId,
        id,
      ])
      // Cached data is a candidate only. Current scoped SQL source/status must
      // match before this payload can be returned; authority is never cached.
      const candidate = this.publishedDefinitions.read(key)
      const current = await this.currentDefinition(
        tx,
        actor,
        scopedProjectId,
        id,
        candidate?.fingerprint ?? null,
      )
      if (!current) throw new NotFoundException('Form unavailable.')
      if (!current.fingerprint) {
        this.publishedDefinitions.evictForm(id)
        return mapForm(await this.findForm(tx, actor, scopedProjectId, id), actor)
      }
      if (
        current.status === 'PUBLISHED' &&
        candidate?.fingerprint === current.fingerprint &&
        current.payload === null
      )
        return candidate.value
      if (!current.payload) throw new NotFoundException('Form unavailable.')
      if (current.status === 'PUBLISHED')
        this.publishedDefinitions.write(key, id, {
          fingerprint: current.fingerprint,
          value: current.payload,
        })
      else this.publishedDefinitions.evictForm(id)
      return current.payload
    })
  }

  createForm(identity: ApplicationIdentity, projectId: string, input: CreateFormDto) {
    assertDefinition(input)
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', async (tx, actor) => {
      const scopedProjectId = await this.requireProject(tx, actor, projectId)
      return this.insertDraft(tx, actor, scopedProjectId, input, 'FORM_DRAFT_CREATED', {})
    })
  }

  /**
   * `forms.generate`: new version-1 draft from a server-owned template or an
   * existing form in the same scoped project. Exactly one source is allowed.
   */
  async generateForm(identity: ApplicationIdentity, projectId: string, input: GenerateFormDto) {
    const hasTemplate = input.templateKey !== undefined
    const hasSource = input.sourceFormId !== undefined
    if (hasTemplate === hasSource)
      throw new BadRequestException('Provide exactly one of templateKey or sourceFormId.')
    if (hasTemplate && !Object.hasOwn(formTemplates, input.templateKey as string))
      throw new BadRequestException('Unknown form template.')
    return withAuthorizedOperation(this.prisma, identity, 'forms.generate', async (tx, actor) => {
      const scopedProjectId = await this.requireProject(tx, actor, projectId)
      let definition: CreateFormDto
      let origin: Prisma.InputJsonObject
      if (hasTemplate) {
        const key = input.templateKey as FormTemplateKey
        const template = formTemplates[key]
        definition = {
          code: input.code,
          name: input.name,
          description: template.description,
          formType: template.formType,
          fields: template.fields.map((item) => ({
            ...item,
            allowedValues: item.allowedValues ? [...item.allowedValues] : undefined,
          })),
        }
        origin = { templateKey: key }
      } else {
        const source = await this.requireForm(
          tx,
          actor,
          scopedProjectId,
          input.sourceFormId as string,
        )
        definition = {
          code: input.code,
          name: input.name,
          description: source.description ?? undefined,
          formType: source.formType,
          activityId: source.activityId ?? undefined,
          journeyStageId: source.journeyStageId ?? undefined,
          fields: source.formField_form.map(fieldInput),
        }
        origin = { sourceFormId: source.id, sourceVersion: source.version }
      }
      assertDefinition(definition)
      return this.insertDraft(tx, actor, scopedProjectId, definition, 'FORM_GENERATED', origin)
    })
  }

  private async insertDraft(
    tx: Tx,
    actor: ApplicationIdentity,
    scopedProjectId: string,
    input: CreateFormDto,
    action: 'FORM_DRAFT_CREATED' | 'FORM_GENERATED',
    origin: Prisma.InputJsonObject,
  ) {
    await this.requireLinks(tx, actor, scopedProjectId, input.activityId, input.journeyStageId)
    const exists = await tx.digitalForm.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: scopedProjectId,
        code: input.code,
      },
      select: { id: true },
    })
    if (exists) throw new ConflictException('That form code already exists in this project.')
    const created = await tx.digitalForm.create({
      data: {
        organizationId: actor.organizationId,
        projectId: scopedProjectId,
        code: input.code,
        version: 1,
        name: input.name,
        description: input.description?.trim() || null,
        formType: input.formType,
        activityId: input.activityId?.toLowerCase(),
        journeyStageId: input.journeyStageId?.toLowerCase(),
        createdById: actor.userId,
      },
      select: { id: true },
    })
    await tx.formField.createMany({
      data: fieldData(actor.organizationId, scopedProjectId, created.id, input.fields),
    })
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        projectId: scopedProjectId,
        action,
        entityType: 'DigitalForm',
        entityId: created.id,
        changes: { code: input.code, version: 1, fieldCount: input.fields.length, ...origin },
      },
    })
    return mapForm(await this.findForm(tx, actor, scopedProjectId, created.id), actor)
  }

  updateForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: UpdateFormDto,
  ) {
    assertDefinition(input)
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', async (tx, actor) => {
      const current = await this.requireForm(tx, actor, projectId, formId)
      this.publishedDefinitions.evictForm(current.id)
      if (current.status !== 'DRAFT') {
        return this.createVersion(tx, actor, current, input)
      }
      const expected = this.expectedDate(input.expectedUpdatedAt)
      await this.requireLinks(tx, actor, current.projectId, input.activityId, input.journeyStageId)
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
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: current.projectId,
          action: 'FORM_DRAFT_UPDATED',
          entityType: 'DigitalForm',
          entityId: current.id,
          changes: { version: current.version, fieldCount: input.fields.length },
        },
      })
      return mapForm(await this.findForm(tx, actor, current.projectId, current.id), actor)
    })
  }

  publishForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: ExpectedVersionDto,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.publish', async (tx, actor) => {
      const current = await this.requireForm(tx, actor, projectId, formId)
      this.publishedDefinitions.evictForm(current.id)
      if (current.status !== 'DRAFT') throw new ConflictException('Only a draft can be published.')
      if (current.createdById === actor.userId) {
        throw new ForbiddenException('A form author cannot approve and publish the same version.')
      }
      const validation = validateAndNormalizeFormData(
        current.formField_form.map(contract),
        {},
        'draft',
      )
      const registrationErrors =
        current.formType === 'BENEFICIARY_REGISTRATION'
          ? beneficiaryRegistrationDefinitionErrors(current.formField_form.map(contract))
          : []
      const activityMonitoringErrors =
        current.formType === 'ACTIVITY_MONITORING'
          ? activityMonitoringDefinitionErrors(current.formField_form.map(contract))
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
      const expected = this.expectedDate(input.expectedUpdatedAt)
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
      if (changed.count !== 1)
        throw new ConflictException('Form changed; reload before publishing.')
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: current.projectId,
          action: 'FORM_PUBLISHED',
          entityType: 'DigitalForm',
          entityId: current.id,
          changes: { code: current.code, version: current.version },
        },
      })
      return mapForm(await this.findForm(tx, actor, current.projectId, current.id), actor)
    })
  }

  archiveForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: ExpectedVersionDto,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.archive', async (tx, actor) => {
      const current = await this.requireForm(tx, actor, projectId, formId)
      this.publishedDefinitions.evictForm(current.id)
      if (current.status === 'ARCHIVED') return mapForm(current, actor)
      const expected = this.expectedDate(input.expectedUpdatedAt)
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
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: current.projectId,
          action: 'FORM_ARCHIVED',
          entityType: 'DigitalForm',
          entityId: current.id,
          changes: { code: current.code, version: current.version },
        },
      })
      return mapForm(await this.findForm(tx, actor, current.projectId, current.id), actor)
    })
  }

  newVersion(identity: ApplicationIdentity, projectId: string, formId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', async (tx, actor) => {
      const current = await this.requireForm(tx, actor, projectId, formId)
      if (current.status === 'DRAFT') {
        throw new ConflictException('Finish the current draft before creating another version.')
      }
      return this.createVersion(tx, actor, current)
    })
  }

  validateValues(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    values: unknown,
    mode: FormValidationMode = 'final',
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        const form = await this.requireForm(tx, actor, projectId, formId)
        if (form.status !== 'PUBLISHED') throw new NotFoundException('Published form unavailable.')
        this.assertDirectEntryForm(form)
        return validateAndNormalizeFormData(form.formField_form.map(contract), values, mode)
      },
    )
  }

  saveSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: SaveSubmissionDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        const form = await this.requireForm(tx, actor, projectId, formId)
        if (form.status !== 'PUBLISHED') throw new NotFoundException('Published form unavailable.')
        this.assertDirectEntryForm(form)
        const validation = validateAndNormalizeFormData(
          form.formField_form.map(contract),
          input.values,
          'draft',
        )
        this.assertValues(validation)
        const beneficiaryId = await this.requireSurveySubject(tx, actor, form, input.beneficiaryId)
        const clientSubmissionId = input.clientSubmissionId.toLowerCase()
        const existing = await tx.formSubmission.findFirst({
          where: {
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            clientSubmissionId,
            ...(form.formType === 'TRAINING_SURVEY' &&
            !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read')
              ? { beneficiaryId: null }
              : {}),
          },
          select: {
            id: true,
            projectId: true,
            formId: true,
            formVersion: true,
            beneficiaryId: true,
          },
        })
        if (existing) {
          if (
            existing.projectId !== form.projectId ||
            existing.formId !== form.id ||
            existing.formVersion !== form.version ||
            existing.beneficiaryId !== beneficiaryId
          ) {
            throw new ConflictException('Submission identifier is already in use.')
          }
          const persisted = await this.findSubmission(tx, actor, form, existing.id)
          if (!sameValues(persisted.values, validation.values)) {
            throw new ConflictException('Submission identifier was reused with different values.')
          }
          return persisted
        }
        let created: { id: string }
        try {
          created = await tx.formSubmission.create({
            data: {
              organizationId: actor.organizationId,
              projectId: form.projectId,
              formId: form.id,
              formVersion: form.version,
              clientSubmissionId,
              beneficiaryId,
              submittedById: actor.userId,
              source: 'DIRECT_ENCODING',
              status: 'DRAFT',
              submittedAt: null,
            },
            select: { id: true },
          })
        } catch (caught) {
          if ((caught as { code?: string }).code === 'P2002') {
            throw new ConflictException('Submission identifier is already in use.')
          }
          throw caught
        }
        await this.replaceResponses(tx, actor, form, created.id, validation.values)
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: form.projectId,
            action: 'FORM_SUBMISSION_DRAFT_SAVED',
            entityType: 'FormSubmission',
            entityId: created.id,
            changes: {
              formId: form.id,
              formVersion: form.version,
              fieldCount: form.formField_form.length,
            },
          },
        })
        return this.findSubmission(tx, actor, form, created.id)
      },
    )
  }

  listSubmissions(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    query: ListSubmissionsQueryDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        const form = await this.requireForm(tx, actor, projectId, formId)
        const offset = Math.min(10_000, Math.max(0, query.offset ?? 0))
        const limit = Math.min(50, Math.max(1, query.limit ?? 10))
        const where = {
          organizationId: actor.organizationId,
          projectId: form.projectId,
          formId: form.id,
          formVersion: form.version,
          submittedById: actor.userId,
          source: 'DIRECT_ENCODING' as const,
        }
        const total = await tx.formSubmission.count({ where })
        const rows = await tx.formSubmission.findMany({
          where,
          select: {
            id: true,
            status: true,
            formVersion: true,
            submittedAt: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: offset,
          take: limit,
        })
        return {
          offset,
          limit,
          total,
          items: rows.map((row) => ({
            id: row.id,
            status: row.status,
            formVersion: row.formVersion,
            submittedAt: row.submittedAt?.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          })),
        }
      },
    )
  }

  private assertDirectEntryForm(form: { formType: string }) {
    if (form.formType === 'BENEFICIARY_REGISTRATION') {
      throw new ConflictException('Use the Beneficiary registration endpoint for this form.')
    }
    if (!(DIRECT_ENTRY_FORM_TYPES as readonly string[]).includes(form.formType)) {
      throw new ConflictException('Encode Project Data is retired; import this form instead.')
    }
  }

  updateSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
    input: UpdateSubmissionDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        const form = await this.requireForm(tx, actor, projectId, formId)
        this.assertDirectEntryForm(form)
        const submission = await this.requireDraftSubmission(tx, actor, form, submissionId)
        const validation = validateAndNormalizeFormData(
          form.formField_form.map(contract),
          input.values,
          'draft',
        )
        this.assertValues(validation)
        const expected = this.expectedDate(input.expectedUpdatedAt)
        const changed = await tx.formSubmission.updateMany({
          where: {
            id: submission.id,
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            status: 'DRAFT',
            updatedAt: expected,
          },
          data: { updatedAt: new Date() },
        })
        if (changed.count !== 1) throw new ConflictException('Draft changed; reload before saving.')
        await this.replaceResponses(tx, actor, form, submission.id, validation.values)
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: form.projectId,
            action: 'FORM_SUBMISSION_DRAFT_SAVED',
            entityType: 'FormSubmission',
            entityId: submission.id,
            changes: {
              formId: form.id,
              formVersion: form.version,
              fieldCount: form.formField_form.length,
            },
          },
        })
        return this.findSubmission(tx, actor, form, submission.id)
      },
    )
  }

  getSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        const form = await this.requireForm(tx, actor, projectId, formId)
        return this.findSubmission(tx, actor, form, submissionId)
      },
    )
  }

  getSubmissionByClientId(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    clientSubmissionId: string,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        if (!UUID_PATTERN.test(clientSubmissionId)) {
          throw new NotFoundException('Submission unavailable.')
        }
        const form = await this.requireForm(tx, actor, projectId, formId)
        const row = await tx.formSubmission.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: form.projectId,
            formId: form.id,
            formVersion: form.version,
            submittedById: actor.userId,
            clientSubmissionId: clientSubmissionId.toLowerCase(),
            source: 'DIRECT_ENCODING',
          },
          select: { id: true },
        })
        if (!row) throw new NotFoundException('Submission unavailable.')
        return this.findSubmission(tx, actor, form, row.id)
      },
    )
  }

  validateSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        const form = await this.requireForm(tx, actor, projectId, formId)
        this.assertDirectEntryForm(form)
        const submission = await this.findSubmission(tx, actor, form, submissionId)
        return validateAndNormalizeFormData(
          form.formField_form.map(contract),
          submission.values,
          'final',
        )
      },
    )
  }

  submitSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
    input: SubmitSubmissionDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'submissions.write',
      async (tx, actor) => {
        const form = await this.requireForm(tx, actor, projectId, formId)
        this.assertDirectEntryForm(form)
        const submission = await this.findSubmission(tx, actor, form, submissionId)
        if (form.formType === 'TRAINING_SURVEY')
          await this.requireSurveySubject(tx, actor, form, submission.beneficiaryId ?? undefined)
        if (submission.status === 'VALIDATED') return submission
        if (submission.status !== 'DRAFT')
          throw new ConflictException('Submission is not editable.')
        const validation = validateAndNormalizeFormData(
          form.formField_form.map(contract),
          submission.values,
          'final',
        )
        this.assertValues(validation)
        const expected = this.expectedDate(input.expectedUpdatedAt)
        if (form.formType === 'ACTIVITY_MONITORING') {
          if (submission.updatedAt !== expected.toISOString()) {
            throw new ConflictException('Draft changed; reload before submitting.')
          }
          await this.participants.promoteParticipation(tx, actor, {
            projectId: form.projectId,
            form: {
              id: form.id,
              version: form.version,
              activityId: form.activityId,
              journeyStageId: form.journeyStageId,
            },
            submissionId: submission.id,
            values: validation.values,
            validatedById: actor.userId,
          })
          return this.findSubmission(tx, actor, form, submission.id)
        }
        const now = new Date()
        const changed = await tx.formSubmission.updateMany({
          where: {
            id: submission.id,
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            status: 'DRAFT',
            updatedAt: expected,
          },
          data: {
            status: 'VALIDATED',
            submittedAt: now,
            validatedById: actor.userId,
            validatedAt: now,
          },
        })
        if (changed.count !== 1) {
          const current = await this.findSubmission(tx, actor, form, submission.id)
          if (current.status === 'VALIDATED') return current
          throw new ConflictException('Draft changed; reload before submitting.')
        }
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: form.projectId,
            action: 'FORM_SUBMISSION_VALIDATED',
            entityType: 'FormSubmission',
            entityId: submission.id,
            changes: {
              formId: form.id,
              formVersion: form.version,
              fieldCount: form.formField_form.length,
            },
          },
        })
        return this.findSubmission(tx, actor, form, submission.id)
      },
    )
  }

  private async currentDefinition(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    formId: string,
    candidateFingerprint: string | null,
  ) {
    // Current header, exact source digest and conditional projection share one
    // statement snapshot. Cache hits avoid returning/hydrating the field payload.
    // Fixed JSON tuples bind every returned header/field value, without repeating
    // property names or unrelated audit timestamps/scope columns. Native JSON
    // escaping preserves boundaries; 1KiB per row conservatively bounds omitted
    // fixed-name/scope serialization overhead inside the unchanged 256KiB cap.
    const rows = await tx.$queryRaw<
      Array<{
        status: string
        fingerprint: string | null
        fieldCount: number
        sourceBytes: bigint
        payload: ReturnType<typeof mapForm> | null
      }>
    >`
      WITH form AS (
        SELECT f.*, json_build_array(f.id,f.project_id,f.code,f.version,f.name,f.description,f.form_type,f.status,
          f.activity_id,f.journey_stage_id,f.created_by_id,f.published_at,f.archived_at,f.updated_at)::text AS source
        FROM pathways.digital_forms f
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND id=${formId}::uuid
      ), fields AS (
        SELECT f.*, json_build_array(f.id,f.code,f.label,f.data_type,f.is_required,f.is_metadata_key,f.is_saddd_field,
          f.allowed_values,f.minimum_value,f.maximum_value,f.minimum_date,f.maximum_date,
          f.minimum_length,f.maximum_length,f.sequence_no)::text AS source
        FROM pathways.form_fields f
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND form_id=${formId}::uuid
        ORDER BY sequence_no,id LIMIT 101
      ), stats AS (
        SELECT count(*)::integer AS count,
          coalesce(sum(octet_length(source)+1024),0)::bigint AS bytes FROM fields
      ), snapshot AS (
        SELECT form.*, stats.count AS field_count, stats.bytes + octet_length(form.source)+1024 AS source_bytes,
          CASE WHEN stats.count<=100 AND stats.bytes+octet_length(form.source)+1024<=262144 THEN
            encode(pg_catalog.sha256(convert_to('['||form.source||',['||
              (SELECT coalesce(string_agg(source,',' ORDER BY id),'') FROM fields)||']]','UTF8')),'hex')
            ELSE NULL END AS fingerprint FROM form CROSS JOIN stats
      )
      SELECT status::text, fingerprint, field_count AS "fieldCount", source_bytes AS "sourceBytes",
        CASE WHEN fingerprint IS NULL OR (status='PUBLISHED' AND fingerprint=${candidateFingerprint}::text) THEN NULL ELSE
          jsonb_build_object('id',id,'projectId',project_id,'code',code,'version',version,'name',name,
            'description',description,'formType',form_type,'status',status,'activityId',activity_id,
            'journeyStageId',journey_stage_id,'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'createdByCurrentUser',coalesce(created_by_id=${actor.userId}::uuid,false),
            'fields',(SELECT coalesce(jsonb_agg(jsonb_build_object(
              'id',id,'code',code,'label',label,'dataType',data_type,'required',is_required,
              'metadataKey',is_metadata_key,'sadddField',is_saddd_field,
              'allowedValues',CASE WHEN jsonb_typeof(allowed_values)='array' THEN
                CASE WHEN NOT EXISTS(SELECT FROM jsonb_array_elements(allowed_values) v WHERE jsonb_typeof(v)<>'string') THEN allowed_values ELSE NULL END ELSE NULL END,
              'minimumLength',minimum_length,'maximumLength',maximum_length,'sequence',sequence_no
            ) || jsonb_strip_nulls(jsonb_build_object(
              'minimumValue',CASE WHEN minimum_value=trunc(minimum_value) THEN trunc(minimum_value)::text ELSE trim(trailing '.' from trim(trailing '0' from minimum_value::text)) END,
              'maximumValue',CASE WHEN maximum_value=trunc(maximum_value) THEN trunc(maximum_value)::text ELSE trim(trailing '.' from trim(trailing '0' from maximum_value::text)) END,
              'minimumDate',to_char(minimum_date,'YYYY-MM-DD'),'maximumDate',to_char(maximum_date,'YYYY-MM-DD')
            )) ORDER BY sequence_no,id),'[]'::jsonb) FROM fields)
          ) || jsonb_strip_nulls(jsonb_build_object(
            'publishedAt',to_char(published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'archivedAt',to_char(archived_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )) END AS payload FROM snapshot`
    return rows[0] ?? null
  }

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const id = projectId.toLowerCase()
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return id
  }

  private async requireForm(tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string) {
    const scopedProjectId = await this.requireProject(tx, actor, projectId)
    if (!UUID_PATTERN.test(formId)) throw new NotFoundException('Form unavailable.')
    return this.findForm(tx, actor, scopedProjectId, formId.toLowerCase())
  }

  private async findForm(tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string) {
    const row = await tx.digitalForm.findFirst({
      where: {
        id: formId,
        organizationId: actor.organizationId,
        projectId,
      },
      select: formSelection,
    })
    if (!row) throw new NotFoundException('Form unavailable.')
    return row
  }

  private async requireLinks(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityId?: string,
    journeyStageId?: string,
  ) {
    if (activityId) {
      const activity = await tx.projectActivity.findFirst({
        where: {
          id: activityId.toLowerCase(),
          organizationId: actor.organizationId,
          projectId,
          archivedAt: null,
        },
        select: { id: true },
      })
      if (!activity) throw new NotFoundException('Linked activity unavailable.')
    }
    if (journeyStageId) {
      const stage = await tx.journeyStage.findFirst({
        where: {
          id: journeyStageId.toLowerCase(),
          organizationId: actor.organizationId,
          projectId,
          archivedAt: null,
        },
        select: { id: true },
      })
      if (!stage) throw new NotFoundException('Linked journey stage unavailable.')
    }
  }

  private async createVersion(
    tx: Tx,
    actor: ApplicationIdentity,
    sourceForm: FormRow,
    override?: UpdateFormDto,
  ) {
    await tx.$queryRaw`
      SELECT id FROM pathways.digital_forms
      WHERE id=${sourceForm.id}::uuid AND organization_id=${actor.organizationId}::uuid
        AND project_id=${sourceForm.projectId}::uuid
      FOR UPDATE
    `
    const source = await this.findForm(tx, actor, sourceForm.projectId, sourceForm.id)
    if (override) {
      if (this.expectedDate(override.expectedUpdatedAt).valueOf() !== source.updatedAt.valueOf()) {
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
      await this.requireLinks(
        tx,
        actor,
        source.projectId,
        override.activityId,
        override.journeyStageId,
      )
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
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
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
      },
    })
    return mapForm(await this.findForm(tx, actor, source.projectId, created.id), actor)
  }

  private async requireSurveySubject(
    tx: Tx,
    actor: ApplicationIdentity,
    form: FormRow,
    beneficiaryId?: string,
  ): Promise<string | null> {
    if (beneficiaryId === undefined) return null
    if (form.formType !== 'TRAINING_SURVEY' || !UUID_PATTERN.test(beneficiaryId))
      throw new BadRequestException(
        'An identified subject is supported only for a training survey.',
      )
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read'))
      throw new ForbiddenException('Current beneficiary detail access is required.')
    const id = beneficiaryId.toLowerCase()
    const enrollment = await tx.beneficiaryProjectEnrollment.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: form.projectId,
        beneficiaryId: id,
        status: 'ACTIVE',
        endedDate: null,
        beneficiary: {
          organizationId: actor.organizationId,
          subjectType: 'INDIVIDUAL',
          isDummyRecord: false,
          archivedAt: null,
          consentRecorded: true,
          dataProcessingConsentRecorded: true,
        },
      },
      select: { id: true },
    })
    if (!enrollment) throw new NotFoundException('Eligible survey contributor unavailable.')
    return id
  }

  private async findSubmission(
    tx: Tx,
    actor: ApplicationIdentity,
    form: FormRow,
    submissionId: string,
  ) {
    if (!UUID_PATTERN.test(submissionId)) throw new NotFoundException('Submission unavailable.')
    const row = await tx.formSubmission.findFirst({
      where: {
        id: submissionId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId: form.projectId,
        formId: form.id,
        formVersion: form.version,
        submittedById: actor.userId,
        source: 'DIRECT_ENCODING',
        ...(form.formType === 'TRAINING_SURVEY' &&
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.records.read')
          ? { beneficiaryId: null }
          : {}),
      },
      select: {
        id: true,
        clientSubmissionId: true,
        beneficiaryId: true,
        status: true,
        formVersion: true,
        submittedAt: true,
        updatedAt: true,
        formResponseValue_submission: {
          select: { fieldId: true, value: true },
          orderBy: { fieldId: 'asc' },
        },
      },
    })
    if (!row) throw new NotFoundException('Submission unavailable.')
    const byId = new Map(form.formField_form.map((field) => [field.id, field.code]))
    const values: Record<string, string | number | boolean | string[] | null> = {}
    for (const response of row.formResponseValue_submission) {
      const code = byId.get(response.fieldId)
      if (code) values[code] = response.value as string | number | boolean | string[] | null
    }
    return {
      id: row.id,
      clientSubmissionId: row.clientSubmissionId,
      beneficiaryId: form.formType === 'TRAINING_SURVEY' ? row.beneficiaryId : null,
      status: row.status,
      formId: form.id,
      formVersion: row.formVersion,
      submittedAt: row.submittedAt?.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      values,
    }
  }

  private async requireDraftSubmission(
    tx: Tx,
    actor: ApplicationIdentity,
    form: FormRow,
    submissionId: string,
  ) {
    const row = await this.findSubmission(tx, actor, form, submissionId)
    if (row.status !== 'DRAFT') throw new ConflictException('Submission is not editable.')
    return row
  }

  private async replaceResponses(
    tx: Tx,
    actor: ApplicationIdentity,
    form: FormRow,
    submissionId: string,
    values: Record<string, string | number | boolean | string[] | null>,
  ) {
    await tx.formResponseValue.deleteMany({
      where: {
        organizationId: actor.organizationId,
        projectId: form.projectId,
        formId: form.id,
        submissionId,
      },
    })
    await tx.formResponseValue.createMany({
      data: form.formField_form.map((field) => {
        const value = values[field.code]
        return {
          organizationId: actor.organizationId,
          projectId: form.projectId,
          formId: form.id,
          submissionId,
          fieldId: field.id,
          value: value == null ? Prisma.JsonNull : value,
        }
      }),
    })
  }

  private expectedDate(value: string) {
    const expected = new Date(value)
    if (Number.isNaN(expected.valueOf()))
      throw new BadRequestException('Invalid revision timestamp.')
    return expected
  }

  private assertValues(result: ReturnType<typeof validateAndNormalizeFormData>) {
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Form responses are invalid.',
        errors: result.errors,
      })
    }
  }
}
