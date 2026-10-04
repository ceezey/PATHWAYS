import { Module } from '@nestjs/common'

import { ActivityExtensionsController } from './activity-extensions.controller'
import { ActivityExtensionsService } from './activity-extensions.service'

@Module({
  controllers: [ActivityExtensionsController],
  providers: [ActivityExtensionsService],
})
export class ActivityExtensionsModule {}
