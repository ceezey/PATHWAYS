import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'

import { readApiEnv } from '@pathways/config'

import { AppModule } from '@app/app.module'
import { allowedWebOrigins } from '@app/common/network/cors-origins'
import { listenOnIpv4Loopback } from '@app/common/network/local-listener'
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
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )
  app.setGlobalPrefix(env.API_PREFIX)
  app.enableCors({
    origin: allowedWebOrigins(env.WEB_ORIGIN),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Pathways-Organization-Id',
      'X-Pathways-User-Id',
    ],
  })
  app.enableShutdownHooks()

  if (env.ENABLE_SWAGGER) {
    const config = new DocumentBuilder()
      .setTitle('PATHWAYS API')
      .setDescription('PATHWAYS backend API.')
      .setVersion('0.1.0')
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup(`${env.API_PREFIX}/docs`, app, document)
  }

  await listenOnIpv4Loopback(app, env.API_PORT)
}

void bootstrap()
