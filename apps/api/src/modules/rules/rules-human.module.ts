import { Module } from '@nestjs/common'
import { AlertsController } from './alerts.controller'
import { NotificationsController } from './notifications.controller'
import { RecommendationsController } from './recommendations.controller'
import { RulesHumanService } from './rules-human.service'
import { RulesController } from './rules.controller'
@Module({
  controllers: [
    RulesController,
    AlertsController,
    RecommendationsController,
    NotificationsController,
  ],
  providers: [RulesHumanService],
  exports: [RulesHumanService],
})
export class RulesHumanModule {}
