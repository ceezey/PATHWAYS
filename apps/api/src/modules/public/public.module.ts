import { Module } from '@nestjs/common'
import { PublicMediaController } from './public-media.controller'
import { PublicMediaService } from './public-media.service'
import { PublicProjectsController } from './public-projects.controller'
import { PublicService } from './public.service'
import { PublicationController } from './publication.controller'
@Module({
  controllers: [PublicProjectsController, PublicationController, PublicMediaController],
  providers: [PublicService, PublicMediaService],
})
export class PublicModule {}
