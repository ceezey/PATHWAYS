import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'

import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructor at runtime.
import { ReserveBeneficiaryMediaDto } from './beneficiary-media.dto'
import { BeneficiaryMediaService } from './beneficiary-media.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('beneficiaries/projects/:projectId/:beneficiaryId/media')
export class BeneficiaryMediaController {
  constructor(@Inject(BeneficiaryMediaService) private readonly media: BeneficiaryMediaService) {}

  @Get()
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.media.list(profile(request), projectId, beneficiaryId)
  }

  @Get('limits')
  @RequirePermission('beneficiaries.enrollments.manage')
  @RequireBeneficiaryStepUp()
  limits() {
    return this.media.limits()
  }

  @Post('reservations')
  @RequirePermission('beneficiaries.enrollments.manage')
  @RequireBeneficiaryStepUp()
  reserve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() body: ReserveBeneficiaryMediaDto,
  ) {
    return this.media.reserve(profile(request), projectId, beneficiaryId, body)
  }

  @Post(':mediaId/finalize')
  @RequirePermission('beneficiaries.enrollments.manage')
  @RequireBeneficiaryStepUp()
  finalize(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.media.finalize(profile(request), projectId, beneficiaryId, mediaId)
  }

  @Get(':mediaId/content')
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  async content(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Param('mediaId') mediaId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    if (request.headers.range !== undefined)
      throw new BadRequestException('Partial content is unavailable.')
    const file = await this.media.content(profile(request), projectId, beneficiaryId, mediaId)
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    // A failed integrity check destroys the connection, so a client never receives a complete unverified file.
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: 'inline',
      length: file.byteSize,
    }).setErrorHandler((_error, destination) => {
      ;(destination as unknown as { destroy(): void }).destroy()
    })
  }
}
