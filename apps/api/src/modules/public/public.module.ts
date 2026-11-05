import { Module } from '@nestjs/common'
import { PublicAnalyticsController } from './public-analytics.controller'
import { PublicAnalyticsService } from './public-analytics.service'
import { PublicMediaStreamController } from './public-media-stream.controller'
import { PublicMediaStreamService } from './public-media-stream.service'
import { PublicMediaController } from './public-media.controller'
import { PublicMediaService } from './public-media.service'
import { PublicProjectsController } from './public-projects.controller'
import { PublicService } from './public.service'
import { PublicationController } from './publication.controller'
@Module({
  controllers: [
    PublicProjectsController,
    PublicationController,
    PublicMediaController,
    PublicMediaStreamController,
    PublicAnalyticsController,
  ],
  providers: [PublicService, PublicMediaService, PublicMediaStreamService, PublicAnalyticsService],
})
export class PublicModule {}
