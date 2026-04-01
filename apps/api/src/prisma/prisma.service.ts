import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      return
    }

    try {
      await this.$connect()
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw error
      }

      const message = error instanceof Error ? error.message : 'Unknown Prisma connection error.'
      this.logger.warn(`Skipping Prisma startup connection in local development: ${message}`)
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
