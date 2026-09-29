import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'

import { readApiEnv } from '@pathways/config'

import { AppModule } from './app.module'
import { corsOptions } from './common/network/cors-origins'
import { inspectionBudgetMiddleware } from './common/network/inspection-request-budget'
import { listenOnIpv4Loopback } from './common/network/local-listener'
import { machineBudgetMiddleware } from './common/network/machine-request-budget'
import { initializeApiSentry } from './common/sentry'

async function bootstrap() {
  initializeApiSentry()

  const env = readApiEnv(process.env)
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  // app.use is registered before Nest init/listen installs its body parser.
  app.use(machineBudgetMiddleware(env.API_PREFIX))
  app.use(inspectionBudgetMiddleware(env.API_PREFIX))
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
  app.enableCors(corsOptions(env.WEB_ORIGIN))
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
