import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common'

import {
  type ArchiveBeneficiaryRequest,
  type BeneficiaryListQuery,
  type EnrollBeneficiaryRequest,
  type RegisterBeneficiaryRequest,
  type UpdateBeneficiaryRequest,
  archiveBeneficiaryRequest,
  beneficiaryListQuery,
  enrollBeneficiaryRequest,
  registerBeneficiaryRequest,
  updateBeneficiaryRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { BeneficiariesService } from './beneficiaries.service'

@Controller('beneficiaries/projects/:projectId')
export class BeneficiariesController {
  constructor(@Inject(BeneficiariesService) private readonly beneficiaries: BeneficiariesService) {}

  @Get()
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query(new ZodPipe(beneficiaryListQuery)) query: BeneficiaryListQuery,
  ) {
    return this.beneficiaries.list(requestIdentity(request), projectId, query)
  }

  @Post('registrations')
  @RequirePermission('beneficiaries.records.register')
  @RequireBeneficiaryStepUp()
  register(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(registerBeneficiaryRequest)) body: RegisterBeneficiaryRequest,
  ) {
    return this.beneficiaries.register(requestIdentity(request), projectId, body)
  }

  @Get('registration-context')
  @RequirePermission('beneficiaries.records.register')
  registrationContext(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.beneficiaries.registrationContext(requestIdentity(request), projectId)
  }

  // Provisions only the fixed system template and returns blank definitions, no Beneficiary data,
  // so it follows registration context (no step-up) rather than the registration POST.
  @Post('registration-context/default-form')
  @RequirePermission('beneficiaries.records.register')
  ensureDefaultRegistrationForm(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.beneficiaries.ensureDefaultRegistrationForm(requestIdentity(request), projectId)
  }

  @Get(':beneficiaryId')
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.beneficiaries.get(requestIdentity(request), projectId, beneficiaryId)
  }

  @Patch(':beneficiaryId')
  @RequirePermission('beneficiaries.profiles.update')
  @RequireBeneficiaryStepUp()
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(updateBeneficiaryRequest)) body: UpdateBeneficiaryRequest,
  ) {
    return this.beneficiaries.update(requestIdentity(request), projectId, beneficiaryId, body)
  }

  @Post(':beneficiaryId/archive')
  @RequirePermission('beneficiaries.records.archive')
  @RequireBeneficiaryStepUp()
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(archiveBeneficiaryRequest)) body: ArchiveBeneficiaryRequest,
  ) {
    return this.beneficiaries.archive(requestIdentity(request), projectId, beneficiaryId, body)
  }

  @Post(':beneficiaryId/enrollments')
  @RequirePermission('beneficiaries.enrollments.manage')
  @RequireBeneficiaryStepUp()
  enroll(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(enrollBeneficiaryRequest)) body: EnrollBeneficiaryRequest,
  ) {
    return this.beneficiaries.enroll(requestIdentity(request), projectId, beneficiaryId, body)
  }
}
