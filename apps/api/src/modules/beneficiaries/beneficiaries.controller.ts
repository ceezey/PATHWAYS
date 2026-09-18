import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'

import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import {
  ArchiveBeneficiaryDto,
  BeneficiaryListQueryDto,
  EnrollBeneficiaryDto,
  RegisterBeneficiaryDto,
  UpdateBeneficiaryDto,
} from './beneficiaries.dto'
import { BeneficiariesService } from './beneficiaries.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('beneficiaries/projects/:projectId')
export class BeneficiariesController {
  constructor(@Inject(BeneficiariesService) private readonly beneficiaries: BeneficiariesService) {}

  @Get()
  @RequirePermission('beneficiaries.records.read')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: BeneficiaryListQueryDto,
  ) {
    return this.beneficiaries.list(profile(request), projectId, query)
  }

  @Post('registrations')
  @RequirePermission('beneficiaries.records.register')
  register(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: RegisterBeneficiaryDto,
  ) {
    return this.beneficiaries.register(profile(request), projectId, body)
  }

  @Get(':beneficiaryId')
  @RequirePermission('beneficiaries.records.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.beneficiaries.get(profile(request), projectId, beneficiaryId)
  }

  @Patch(':beneficiaryId')
  @RequirePermission('beneficiaries.profiles.update')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() body: UpdateBeneficiaryDto,
  ) {
    return this.beneficiaries.update(profile(request), projectId, beneficiaryId, body)
  }

  @Post(':beneficiaryId/archive')
  @RequirePermission('beneficiaries.records.archive')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() body: ArchiveBeneficiaryDto,
  ) {
    return this.beneficiaries.archive(profile(request), projectId, beneficiaryId, body)
  }

  @Post(':beneficiaryId/enrollments')
  @RequirePermission('beneficiaries.enrollments.manage')
  enroll(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() body: EnrollBeneficiaryDto,
  ) {
    return this.beneficiaries.enroll(profile(request), projectId, beneficiaryId, body)
  }
}
