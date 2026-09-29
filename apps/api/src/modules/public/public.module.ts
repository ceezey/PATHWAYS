import { Module } from '@nestjs/common'
import { PublicProjectsController, PublicationController } from './public.controller'
import { PublicService } from './public.service'
@Module({
  controllers: [PublicProjectsController, PublicationController],
  providers: [PublicService],
})
export class PublicModule {}
