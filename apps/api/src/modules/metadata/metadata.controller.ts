import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'

import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import {
  CreateFormDto,
  ExpectedVersionDto,
  SaveSubmissionDto,
  SubmitSubmissionDto,
  UpdateFormDto,
  UpdateSubmissionDto,
  ValidateValuesDto,
} from './metadata.dto'
import { MetadataService } from './metadata.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('metadata/projects/:projectId/forms')
export class MetadataController {
  constructor(@Inject(MetadataService) private readonly metadata: MetadataService) {}

  @Get()
  @RequirePermission('forms.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.metadata.listForms(profile(request), projectId)
  }

  @Post()
  @RequirePermission('forms.manage')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: CreateFormDto,
  ) {
    return this.metadata.createForm(profile(request), projectId, body)
  }

  @Get(':formId')
  @RequirePermission('forms.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
  ) {
    return this.metadata.getForm(profile(request), projectId, formId)
  }

  @Patch(':formId')
  @RequirePermission('forms.manage')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body() body: UpdateFormDto,
  ) {
    return this.metadata.updateForm(profile(request), projectId, formId, body)
  }

  @Post(':formId/publish')
  @RequirePermission('forms.publish')
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body() body: ExpectedVersionDto,
  ) {
    return this.metadata.publishForm(profile(request), projectId, formId, body)
  }

  @Post(':formId/archive')
  @RequirePermission('forms.manage')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body() body: ExpectedVersionDto,
  ) {
    return this.metadata.archiveForm(profile(request), projectId, formId, body)
  }

  @Post(':formId/versions')
  @RequirePermission('forms.manage')
  newVersion(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
  ) {
    return this.metadata.newVersion(profile(request), projectId, formId)
  }

  @Post(':formId/validate')
  @RequirePermission('submissions.write')
  validateValues(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body() body: ValidateValuesDto,
  ) {
    return this.metadata.validateValues(profile(request), projectId, formId, body.values)
  }

  @Post(':formId/submissions')
  @RequirePermission('submissions.write')
  saveSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body() body: SaveSubmissionDto,
  ) {
    return this.metadata.saveSubmission(profile(request), projectId, formId, body)
  }

  @Get(':formId/submissions/:submissionId')
  @RequirePermission('submissions.write')
  getSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.metadata.getSubmission(profile(request), projectId, formId, submissionId)
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
      profile(request),
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
    @Body() body: UpdateSubmissionDto,
  ) {
    return this.metadata.updateSubmission(profile(request), projectId, formId, submissionId, body)
  }

  @Post(':formId/submissions/:submissionId/validate')
  @RequirePermission('submissions.write')
  validateSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.metadata.validateSubmission(profile(request), projectId, formId, submissionId)
  }

  @Post(':formId/submissions/:submissionId/submit')
  @RequirePermission('submissions.write')
  submitSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Body() body: SubmitSubmissionDto,
  ) {
    return this.metadata.submitSubmission(profile(request), projectId, formId, submissionId, body)
  }
}
