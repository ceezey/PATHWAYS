import { Body, Controller, ForbiddenException, Get, Inject, Param, Post, Req } from '@nestjs/common'

import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructor at runtime.
import { ResolveDuplicateDto } from './beneficiaries.dto'
import { IdentityReviewService } from './identity-review.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

// Declared before BeneficiariesController so its fixed paths win over ':beneficiaryId'.
@Controller('beneficiaries/projects/:projectId/duplicate-candidates')
export class IdentityReviewController {
  constructor(@Inject(IdentityReviewService) private readonly review: IdentityReviewService) {}

  @Get()
  @RequirePermission('beneficiaries.identities.review')
  @RequireBeneficiaryStepUp()
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.review.candidates(profile(request), projectId)
  }

  @Post('resolve')
  @RequirePermission('beneficiaries.identities.review')
  @RequireBeneficiaryStepUp()
  resolve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: ResolveDuplicateDto,
  ) {
    return this.review.resolve(profile(request), projectId, body)
  }
}
