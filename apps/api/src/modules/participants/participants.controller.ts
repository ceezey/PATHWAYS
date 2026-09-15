import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common'

import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { SaveJourneyConfigurationDto } from '@app/modules/activities/activities.dto'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
import type { CorrectJourneyEventDto, EnrollmentJourneyEventDto } from './participants.dto'
import { ParticipantsService } from './participants.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('projects/:projectId/journey-stages')
export class JourneyStagesController {
  constructor(@Inject(ParticipantsService) private readonly participants: ParticipantsService) {}
  @Get()
  @RequirePermission('journeys.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.participants.listStages(profile(request), projectId)
  }
  @Put()
  @RequirePermission('journeys.manage')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: SaveJourneyConfigurationDto,
  ) {
    return this.participants.saveStages(profile(request), projectId, body)
  }
}

@Controller('beneficiaries/projects/:projectId/:beneficiaryId/journey')
export class BeneficiaryJourneyController {
  constructor(@Inject(ParticipantsService) private readonly participants: ParticipantsService) {}
  @Get()
  @RequirePermission('journeys.read')
  history(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.participants.history(profile(request), projectId, beneficiaryId)
  }
  @Post('events')
  @RequirePermission('beneficiaries.enrollments.manage')
  transition(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() body: EnrollmentJourneyEventDto,
  ) {
    return this.participants.transitionEnrollment(profile(request), projectId, beneficiaryId, body)
  }
  @Post('events/:eventId/corrections')
  @RequirePermission('participation.record')
  correct(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Param('eventId') eventId: string,
    @Body() body: CorrectJourneyEventDto,
  ) {
    return this.participants.correctEvent(profile(request), projectId, beneficiaryId, eventId, body)
  }
}
