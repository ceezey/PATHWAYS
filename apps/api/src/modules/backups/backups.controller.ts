import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Req } from '@nestjs/common'

import {
  type DownloadRecoveryPointRequest,
  type RestoreRecoveryPointRequest,
  downloadRecoveryPointRequest,
  restoreRecoveryPointRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { RequireTotpStepUp } from '../../common/decorators/totp-step-up.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { BackupsService } from './backups.service'

@Controller('backups')
export class BackupsController {
  constructor(@Inject(BackupsService) private readonly service: BackupsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('backups.create', 'backups.restore')
  list(@Req() request: AuthenticatedRequest) {
    return this.service.list(requestIdentity(request))
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('backups.create')
  create(@Req() request: AuthenticatedRequest) {
    return this.service.create(requestIdentity(request))
  }

  @Post(':pointId/verify')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('backups.create', 'backups.restore')
  verify(@Req() request: AuthenticatedRequest, @Param('pointId') pointId: string) {
    return this.service.verify(requestIdentity(request), pointId)
  }

  // A POST because each download writes an audit row.
  @Post(':pointId/download')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('backups.create', 'backups.restore')
  @RequireTotpStepUp()
  download(
    @Req() request: AuthenticatedRequest,
    @Param('pointId') pointId: string,
    @Body(new ZodPipe(downloadRecoveryPointRequest)) body: DownloadRecoveryPointRequest,
  ) {
    return this.service.download(requestIdentity(request), pointId, body)
  }

  @Post(':pointId/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('backups.restore')
  @RequireTotpStepUp()
  restore(
    @Req() request: AuthenticatedRequest,
    @Param('pointId') pointId: string,
    @Body(new ZodPipe(restoreRecoveryPointRequest)) body: RestoreRecoveryPointRequest,
  ) {
    return this.service.restore(requestIdentity(request), pointId, body)
  }
}
