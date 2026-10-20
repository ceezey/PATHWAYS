import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common'

import { type ResolveDuplicateRequest, resolveDuplicateRequest } from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { IdentityReviewService } from './identity-review.service'

// Declared before BeneficiariesController so its fixed paths win over ':beneficiaryId'.
@Controller('beneficiaries/projects/:projectId/duplicate-candidates')
export class IdentityReviewController {
  constructor(@Inject(IdentityReviewService) private readonly review: IdentityReviewService) {}

  @Get()
  @RequirePermission('beneficiaries.identities.review')
  @RequireBeneficiaryStepUp()
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.review.candidates(requestIdentity(request), projectId)
  }

  @Post('resolve')
  @RequirePermission('beneficiaries.identities.review')
  @RequireBeneficiaryStepUp()
  resolve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(resolveDuplicateRequest)) body: ResolveDuplicateRequest,
  ) {
    return this.review.resolve(requestIdentity(request), projectId, body)
  }
}
