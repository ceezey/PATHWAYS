import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { EvaluationsService } from './evaluations.service'

@Controller('projects/:projectId/evaluation')
export class EvaluationsController {
  constructor(@Inject(EvaluationsService) private readonly service: EvaluationsService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.get(request.user, projectId)
  }
  @Get('assessments')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('assessments.detail.read')
  @RequireBeneficiaryStepUp()
  beneficiaryAssessments(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.listBeneficiaryAssessments(request.user, projectId, query)
  }
  @Get('assessments/:assessmentId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('assessments.detail.read')
  @RequireBeneficiaryStepUp()
  assessment(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('assessmentId') assessmentId: string,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.getAssessmentDetail(request.user, projectId, assessmentId)
  }
  @Post('evaluations')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evaluations.submit')
  createEvaluation(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.createEvaluation(request.user, projectId, input)
  }
  @Patch('evaluations/:evaluationId/scores')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evaluations.submit')
  saveScores(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() input: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.saveScores(request.user, projectId, evaluationId, input)
  }
  @Post('evaluations/:evaluationId/submit')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evaluations.submit')
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() input: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.submit(request.user, projectId, evaluationId, input)
  }
  @Post('evaluations/:evaluationId/return')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evaluations.approve')
  returnToDraft(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() input: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.returnToDraft(request.user, projectId, evaluationId, input)
  }
  @Post('evaluations/:evaluationId/signoff')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evaluations.approve')
  signoff(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() input: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.signoff(request.user, projectId, evaluationId, input)
  }
}
