import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { inspectionRequestBudget } from '../../common/network/inspection-request-budget'
import { ActivityEvidenceService } from './activity-evidence.service'
import {
  PrivateProofInspectionService,
  inspectionRevisions,
} from './private-proof-inspection.service'

// Private proof inspection and download for reviewers.
@Controller('projects/:projectId/activities')
export class ActivityProofsController {
  constructor(
    @Inject(ActivityEvidenceService) private readonly evidence: ActivityEvidenceService,
    @Inject(PrivateProofInspectionService)
    private readonly inspection: PrivateProofInspectionService,
  ) {}

  @Get(':activityId/updates/:updateId/inspection-context')
  @RequirePermission('evidence.review')
  inspectionContext(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('updateId') updateId: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length)
      throw new BadRequestException('Invalid inspection context query.')
    return this.inspection.context(requestIdentity(request), projectId, activityId, updateId)
  }

  @Get(':activityId/updates/:updateId/proof/:evidenceId/inspection')
  @RequirePermission('evidence.review')
  async inspectProof(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('updateId') updateId: string,
    @Param('evidenceId') evidenceId: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    if (request.headers.range !== undefined)
      throw new BadRequestException('Partial inspection is unavailable.')
    const released = await this.inspection.inspect(
      requestIdentity(request),
      projectId,
      activityId,
      updateId,
      evidenceId,
      inspectionRevisions(query),
    )
    try {
      inspectionRequestBudget(request)?.check()
    } catch (error) {
      released.body.destroy()
      throw error
    }
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    // Streamed after final authorization and audit. A failed integrity check destroys the
    // connection, so the client never receives a complete unverified attachment.
    return new StreamableFile(released.body, {
      type: released.contentType,
      disposition: `attachment; filename="${released.fileName}"`,
      length: released.byteSize,
    }).setErrorHandler((_error, destination) => {
      // The Express response is a destroyable socket-backed stream.
      ;(destination as unknown as { destroy(): void }).destroy()
    })
  }

  @Get(':activityId/proof/:evidenceId')
  @RequirePermission('evidence.read')
  async proof(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('evidenceId') evidenceId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const proof = await this.evidence.downloadProof(
      requestIdentity(request),
      projectId,
      activityId,
      evidenceId,
    )
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(proof.body, {
      type: proof.contentType,
      disposition: `attachment; filename="${proof.fileName.replace(/[^\w.-]/g, '_')}"`,
    })
  }
}
