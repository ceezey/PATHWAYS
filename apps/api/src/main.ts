import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'

import { readApiEnv } from '@pathways/config'

import { AppModule } from '@app/app.module'
import { initializeApiSentry } from '@app/common/sentry'

async function bootstrap() {
  initializeApiSentry()

  const env = readApiEnv(process.env)
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  app.useLogger(app.get(Logger))
  app.use(helmet())
  app.use(compression())
  app.use(cookieParser())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )
  app.setGlobalPrefix(env.API_PREFIX)
  app.enableCors({
    origin: true,
    credentials: true,
  })

  if (env.ENABLE_SWAGGER) {
    const config = new DocumentBuilder()
      .setTitle('PATHWAYS API')
      .setDescription('Development-ready scaffold for the PATHWAYS backend.')
      .setVersion('0.1.0')
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup(`${env.API_PREFIX}/docs`, app, document)
  }

  await app.listen(env.API_PORT)
}

void bootstrap()
