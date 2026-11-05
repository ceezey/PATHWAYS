import type { ServerResponse } from 'node:http'
import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common'

import { Public } from '../../common/decorators/public.decorator'
import { PublicMediaStreamService } from './public-media-stream.service'

@Controller('public/projects/:projectId/media')
export class PublicMediaStreamController {
  constructor(@Inject(PublicMediaStreamService) private readonly media: PublicMediaStreamService) {}

  @Get(':mediaId')
  @Public()
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async get(
    @Param('projectId') projectId: string,
    @Param('mediaId') mediaId: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const file = await this.media.open(projectId, mediaId, range)
    response.statusCode = file.status
    if (file.isVideo) response.setHeader('Accept-Ranges', 'bytes')
    if (file.contentRange) response.setHeader('Content-Range', file.contentRange)
    // A full file is digest-checked and a failed check destroys the connection; a byte range is served unverified.
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: 'inline',
      length: file.length,
    }).setErrorHandler((_error, destination) => {
      ;(destination as unknown as { destroy(): void }).destroy()
    })
  }
}
