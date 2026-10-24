import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'

import {
  type ConfirmDraftCheckRequest,
  type CreateFormRequest,
  type DraftFromImportRequest,
  type FormVersionRequest,
  type GenerateFormRequest,
  type ListSubmissionsQuery,
  type SaveSubmissionRequest,
  type SubmitSubmissionRequest,
  type UpdateFormRequest,
  type UpdateSubmissionRequest,
  type ValidateFormValuesRequest,
  confirmDraftCheckRequest,
  createFormRequest,
  draftFromImportRequest,
  formVersionRequest,
  generateFormRequest,
  listSubmissionsQuery,
  saveSubmissionRequest,
  submitSubmissionRequest,
  updateFormRequest,
  updateSubmissionRequest,
  validateFormValuesRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { FormDefinitionExportService } from './form-definition-export.service'
import { MetadataService } from './metadata.service'

@Controller('metadata/projects/:projectId/forms')
export class MetadataController {
  constructor(
    @Inject(MetadataService) private readonly metadata: MetadataService,
    @Inject(FormDefinitionExportService) private readonly formExport: FormDefinitionExportService,
  ) {}

  @Get()
  @RequirePermission('forms.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.metadata.listForms(requestIdentity(request), projectId)
  }

  @Post()
  @RequirePermission('forms.manage')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(createFormRequest)) body: CreateFormRequest,
  ) {
    return this.metadata.createForm(requestIdentity(request), projectId, body)
  }

  @Post('generate')
  @RequirePermission('forms.generate')
  generate(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(generateFormRequest)) body: GenerateFormRequest,
  ) {
    return this.metadata.generateForm(requestIdentity(request), projectId, body)
  }

  @Get(':formId')
  @RequirePermission('forms.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
  ) {
    return this.metadata.getForm(requestIdentity(request), projectId, formId)
  }

  @Get(':formId/export')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('forms.export')
  async exportDefinition(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Query('format') format: unknown,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ) {
    const result = await this.formExport.export(requestIdentity(request), projectId, formId, format)
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(result.bytes)
  }

  @Patch(':formId')
  @RequirePermission('forms.manage')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(updateFormRequest)) body: UpdateFormRequest,
  ) {
    return this.metadata.updateForm(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/confirm-check')
  @RequirePermission('forms.manage')
  confirmCheck(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(confirmDraftCheckRequest)) body: ConfirmDraftCheckRequest,
  ) {
    return this.metadata.confirmCheck(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/publish')
  @RequirePermission('forms.publish')
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(formVersionRequest)) body: FormVersionRequest,
  ) {
    return this.metadata.publishForm(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/archive')
  @RequirePermission('forms.archive')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(formVersionRequest)) body: FormVersionRequest,
  ) {
    return this.metadata.archiveForm(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/versions')
  @RequirePermission('forms.manage')
  newVersion(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
  ) {
    return this.metadata.newVersion(requestIdentity(request), projectId, formId)
  }

  @Post(':formId/drafts/from-import')
  @RequirePermission('forms.manage')
  draftFromImport(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(draftFromImportRequest)) body: DraftFromImportRequest,
  ) {
    return this.metadata.draftFromImport(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/validate')
  @RequirePermission('submissions.write')
  validateValues(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(validateFormValuesRequest)) body: ValidateFormValuesRequest,
  ) {
    return this.metadata.validateValues(requestIdentity(request), projectId, formId, body.values)
  }

  @Post(':formId/submissions')
  @RequirePermission('submissions.write')
  saveSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(saveSubmissionRequest)) body: SaveSubmissionRequest,
  ) {
    return this.metadata.saveSubmission(requestIdentity(request), projectId, formId, body)
  }

  @Get(':formId/submissions')
  @RequirePermission('submissions.write')
  listSubmissions(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Query(new ZodPipe(listSubmissionsQuery)) query: ListSubmissionsQuery,
  ) {
    return this.metadata.listSubmissions(requestIdentity(request), projectId, formId, query)
  }

  @Get(':formId/submissions/:submissionId')
  @RequirePermission('submissions.write')
  getSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.metadata.getSubmission(requestIdentity(request), projectId, formId, submissionId)
  }

  @Get(':formId/submissions/by-client/:clientSubmissionId')
  @RequirePermission('submissions.write')
  getSubmissionByClientId(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('clientSubmissionId') clientSubmissionId: string,
  ) {
    return this.metadata.getSubmissionByClientId(
      requestIdentity(request),
      projectId,
      formId,
      clientSubmissionId,
    )
  }

  @Patch(':formId/submissions/:submissionId')
  @RequirePermission('submissions.write')
  updateSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Body(new ZodPipe(updateSubmissionRequest)) body: UpdateSubmissionRequest,
  ) {
    return this.metadata.updateSubmission(
      requestIdentity(request),
      projectId,
      formId,
      submissionId,
      body,
    )
  }

  @Post(':formId/submissions/:submissionId/validate')
  @RequirePermission('submissions.write')
  validateSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.metadata.validateSubmission(
      requestIdentity(request),
      projectId,
      formId,
      submissionId,
    )
  }

  @Post(':formId/submissions/:submissionId/submit')
  @RequirePermission('submissions.write')
  submitSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Body(new ZodPipe(submitSubmissionRequest)) body: SubmitSubmissionRequest,
  ) {
    return this.metadata.submitSubmission(
      requestIdentity(request),
      projectId,
      formId,
      submissionId,
      body,
    )
  }
}
