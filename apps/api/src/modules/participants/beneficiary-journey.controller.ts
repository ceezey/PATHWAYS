import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common'

import {
  type CorrectJourneyEventRequest,
  type RecordJourneyEventRequest,
  correctJourneyEventRequest,
  recordJourneyEventRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { BeneficiaryJourneyService } from './beneficiary-journey.service'

@Controller('beneficiaries/projects/:projectId/:beneficiaryId/journey')
export class BeneficiaryJourneyController {
  constructor(
    @Inject(BeneficiaryJourneyService) private readonly journey: BeneficiaryJourneyService,
  ) {}
  @Get()
  @RequirePermission('journeys.read')
  @RequireBeneficiaryStepUp()
  history(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.journey.history(requestIdentity(request), projectId, beneficiaryId)
  }
  @Post('events')
  @RequirePermission('beneficiaries.enrollments.manage')
  @RequireBeneficiaryStepUp()
  transition(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(recordJourneyEventRequest)) body: RecordJourneyEventRequest,
  ) {
    return this.journey.transitionEnrollment(
      requestIdentity(request),
      projectId,
      beneficiaryId,
      body,
    )
  }
  @Post('events/:eventId/corrections')
  @RequirePermission('participation.record')
  @RequireBeneficiaryStepUp()
  correct(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodPipe(correctJourneyEventRequest)) body: CorrectJourneyEventRequest,
  ) {
    return this.journey.correctEvent(
      requestIdentity(request),
      projectId,
      beneficiaryId,
      eventId,
      body,
    )
  }
}
