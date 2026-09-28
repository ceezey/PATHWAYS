import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import {
  ReportArtifactInputError,
  createReportArtifact,
  reportMime,
} from '../reports/report-artifact'
import {
  type ExportableFormDefinition,
  formDefinitionExportFileName,
  formDefinitionExportRows,
  parseFormDefinitionExportFormat,
} from './form-definition-export'

type Tx = Prisma.TransactionClient

const exportSelection = {
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
  updatedAt: true,
  formField_form: {
    select: {
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
    },
    orderBy: { sequenceNo: 'asc' as const },
  },
} satisfies Prisma.DigitalFormSelect

type ExportRow = Prisma.DigitalFormGetPayload<{ select: typeof exportSelection }>

function exportable(form: ExportRow): ExportableFormDefinition {
  return {
    id: form.id,
    projectId: form.projectId,
    code: form.code,
    version: form.version,
    name: form.name,
    description: form.description,
    status: form.status,
    formType: form.formType,
    activityId: form.activityId,
    journeyStageId: form.journeyStageId,
    fields: form.formField_form.map((field) => ({
      code: field.code,
      label: field.label,
      dataType: field.dataType,
      required: field.isRequired,
      metadataKey: field.isMetadataKey,
      sadddField: field.isSadddField,
      allowedValues:
        Array.isArray(field.allowedValues) &&
        field.allowedValues.every((item) => typeof item === 'string')
          ? (field.allowedValues as string[])
          : null,
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

/**
 * Blank form-definition export through the protected request path. The definition is
 * read under forms.export with project scope applied before the form query, rendered
 * outside the transaction, then audited in a second verified transaction that confirms
 * the exported version is still current.
 */
@Injectable()
export class FormDefinitionExportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async export(identity: ApplicationIdentity, projectId: string, formId: string, format: unknown) {
    const wanted = parseFormDefinitionExportFormat(format)
    if (!wanted) throw new BadRequestException('Choose CSV, XLSX, XLS or PDF.')
    const form = await withAuthorizedOperation(this.prisma, identity, 'forms.export', (tx, actor) =>
      this.readForm(tx, actor, projectId, formId),
    )
    const definition = exportable(form)
    let bytes: Buffer
    try {
      bytes = await createReportArtifact(
        `${definition.name} v${definition.version}`.slice(0, 200),
        formDefinitionExportRows(definition),
        wanted,
      )
    } catch (error) {
      // A definition too large for the artifact bounds fails whole; it is never truncated.
      if (error instanceof ReportArtifactInputError)
        throw new UnprocessableEntityException(error.message)
      throw new ServiceUnavailableException('Form export temporarily unavailable.')
    }
    await withAuthorizedOperation(this.prisma, identity, 'forms.export', async (tx, actor) => {
      const current = await this.readForm(tx, actor, projectId, formId)
      if (current.updatedAt.getTime() !== form.updatedAt.getTime()) {
        throw new ConflictException('The form changed during export. Retry the download.')
      }
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: current.projectId,
          action: 'FORM_DEFINITION_EXPORTED',
          entityType: 'DigitalForm',
          entityId: current.id,
          changes: { formId: current.id, version: current.version, format: wanted },
        },
      })
    })
    return {
      bytes,
      contentType: reportMime[wanted],
      fileName: formDefinitionExportFileName(definition, wanted),
    }
  }

  private async readForm(tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    if (!UUID_PATTERN.test(formId)) throw new NotFoundException('Form unavailable.')
    const form = await tx.digitalForm.findFirst({
      where: {
        id: formId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId: project.id,
      },
      select: exportSelection,
    })
    if (!form) throw new NotFoundException('Form unavailable.')
    return form
  }
}
