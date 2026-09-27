import { Module } from '@nestjs/common'
import {
  AlertsController,
  NotificationsController,
  RecommendationsController,
  RulesController,
} from './rules-human.controller'
import { RulesHumanService } from './rules-human.service'
@Module({
  controllers: [
    RulesController,
    AlertsController,
    RecommendationsController,
    NotificationsController,
  ],
  providers: [RulesHumanService],
})
export class RulesHumanModule {}
