import { Body, Controller, Get, Inject, Param, Post, Put, Req } from '@nestjs/common'

import {
  type CorrectJourneyEventRequest,
  type RecordJourneyEventRequest,
  type SaveJourneyStagesRequest,
  correctJourneyEventRequest,
  recordJourneyEventRequest,
  saveJourneyStagesRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ParticipantsService } from './participants.service'

@Controller('projects/:projectId/journey-stages')
export class JourneyStagesController {
  constructor(@Inject(ParticipantsService) private readonly participants: ParticipantsService) {}
  // Project-level configuration read: Admin holds journeys.manage only.
  @Get()
  @RequirePermission('journeys.read', 'journeys.manage')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.participants.listStages(requestIdentity(request), projectId)
  }
  @Put()
  @RequirePermission('journeys.manage')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(saveJourneyStagesRequest)) body: SaveJourneyStagesRequest,
  ) {
    return this.participants.saveStages(requestIdentity(request), projectId, body)
  }
}

@Controller('beneficiaries/projects/:projectId/:beneficiaryId/journey')
export class BeneficiaryJourneyController {
  constructor(@Inject(ParticipantsService) private readonly participants: ParticipantsService) {}
  @Get()
  @RequirePermission('journeys.read')
  @RequireBeneficiaryStepUp()
  history(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.participants.history(requestIdentity(request), projectId, beneficiaryId)
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
    return this.participants.transitionEnrollment(
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
    return this.participants.correctEvent(
      requestIdentity(request),
      projectId,
      beneficiaryId,
      eventId,
      body,
    )
  }
}
