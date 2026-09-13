import { Module } from '@nestjs/common'

import { AuthDirectoryService } from './auth-directory.service'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({ controllers: [UsersController], providers: [UsersService, AuthDirectoryService] })
export class UsersModule {}
