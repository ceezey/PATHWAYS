import { Module } from '@nestjs/common'
import { PublicProjectsController } from './public-projects.controller'
import { PublicService } from './public.service'
import { PublicationController } from './publication.controller'
@Module({
  controllers: [PublicProjectsController, PublicationController],
  providers: [PublicService],
})
export class PublicModule {}
