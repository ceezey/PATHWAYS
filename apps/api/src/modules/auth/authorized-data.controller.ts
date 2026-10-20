import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { AuthorizedDataService } from './authorized-data.service'

// Small read-only access reads; no generic query, write or onboarding route.
@Controller('access')
export class AuthorizedDataController {
  constructor(@Inject(AuthorizedDataService) private readonly data: AuthorizedDataService) {}

  @Get('projects')
  @RequirePermission('projects.read')
  @Header('Cache-Control', 'no-store')
  projects(@Req() request: AuthenticatedRequest) {
    return this.data.projects(requestIdentity(request))
  }

  @Get('projects/:projectId/beneficiaries')
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  @Header('Cache-Control', 'no-store')
  beneficiaries(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.data.beneficiaries(requestIdentity(request), projectId)
  }

  @Get('projects/:projectId/beneficiary-aggregate')
  @RequirePermission('beneficiaries.aggregates.read')
  @Header('Cache-Control', 'no-store')
  aggregate(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.data.beneficiaryAggregate(requestIdentity(request), projectId)
  }
}
