import { Controller, ForbiddenException, Get, Header, Inject, Param, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { AuthorizedDataService } from './authorized-data.service'
import type { AuthenticatedRequest } from './developer-access'

function verifiedProfile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

/** Small read-only Phase 5 contracts. No generic query/write or onboarding API. */
@Controller('access')
export class AuthorizedDataController {
  constructor(@Inject(AuthorizedDataService) private readonly data: AuthorizedDataService) {}

  @Get('projects')
  @RequirePermission('projects.read')
  @Header('Cache-Control', 'no-store')
  projects(@Req() request: AuthenticatedRequest) {
    return this.data.projects(verifiedProfile(request))
  }

  @Get('projects/:projectId/beneficiaries')
  @RequirePermission('beneficiaries.records.read')
  @Header('Cache-Control', 'no-store')
  beneficiaries(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.data.beneficiaries(verifiedProfile(request), projectId)
  }

  @Get('projects/:projectId/beneficiary-aggregate')
  @RequirePermission('beneficiaries.aggregates.read')
  @Header('Cache-Control', 'no-store')
  aggregate(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.data.beneficiaryAggregate(verifiedProfile(request), projectId)
  }
}
