import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common'

import { type ReservePublicMediaRequest, reservePublicMediaRequest } from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { PublicMediaService } from './public-media.service'

// Listing and viewing media also need evidence.read; the service checks it because the guard accepts any listed permission.
@Controller('projects/:projectId/public-media')
export class PublicMediaController {
  constructor(@Inject(PublicMediaService) private readonly media: PublicMediaService) {}

  @Get()
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.media.list(requestIdentity(request), projectId)
  }

  @Get('limits')
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  limits() {
    return this.media.limits()
  }

  @Post('reservations')
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  reserve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(reservePublicMediaRequest)) body: ReservePublicMediaRequest,
  ) {
    return this.media.reserve(requestIdentity(request), projectId, body)
  }

  @Post(':mediaId/finalize')
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  finalize(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.media.finalize(requestIdentity(request), projectId, mediaId)
  }

  @Post(':mediaId/submit')
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.media.submit(requestIdentity(request), projectId, mediaId)
  }

  @Post(':mediaId/approve')
  @RequirePermission('public.approve')
  @Header('Cache-Control', 'private, no-store')
  approve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.media.approve(requestIdentity(request), projectId, mediaId)
  }

  @Post(':mediaId/reject')
  @RequirePermission('public.approve')
  @Header('Cache-Control', 'private, no-store')
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
    @Body() body: unknown,
  ) {
    return this.media.reject(requestIdentity(request), projectId, mediaId, body)
  }

  @Get(':mediaId/content')
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
  ) {
    if (request.headers.range !== undefined)
      throw new BadRequestException('Partial content is unavailable.')
    const file = await this.media.content(requestIdentity(request), projectId, mediaId)
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
