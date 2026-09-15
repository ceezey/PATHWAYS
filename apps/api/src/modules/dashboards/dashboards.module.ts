import { Module } from '@nestjs/common'
import { IndicatorsModule } from '@app/modules/indicators/indicators.module'
import { DashboardsController } from './dashboards.controller'
import { DashboardsService } from './dashboards.service'
@Module({ imports: [IndicatorsModule], controllers: [DashboardsController], providers: [DashboardsService], exports: [DashboardsService] })
export class DashboardsModule {}
