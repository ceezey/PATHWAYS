import { Module } from '@nestjs/common'

import { RateLimitService } from './rate-limit.service'

@Module({ providers: [RateLimitService], exports: [RateLimitService] })
export class RateLimitModule {}
