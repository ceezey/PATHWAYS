import { Module } from '@nestjs/common'
import { IndicatorsController } from './indicators.controller'
import { IndicatorsService } from './indicators.service'
@Module({ controllers: [IndicatorsController], providers: [IndicatorsService], exports: [IndicatorsService] })
export class IndicatorsModule {}
