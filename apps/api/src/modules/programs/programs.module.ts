import { Module } from '@nestjs/common'

import { ProgramsController } from './programs.controller'
import { ProgramsService } from './programs.service'

@Module({ controllers: [ProgramsController], providers: [ProgramsService] })
export class ProgramsModule {}
