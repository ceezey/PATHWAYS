import 'reflect-metadata'
import { Writable } from 'node:stream'

import { Logger, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { expect, it } from 'vitest'

import { createPathwaysPinoHttpOptions, usePathwaysLogger } from './app.module'

const lines: string[] = []
const capture = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    lines.push(chunk.toString())
    callback()
  },
})

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: [createPathwaysPinoHttpOptions('production'), capture] }),
  ],
})
class ProbeModule {}

// Vercel never runs Nest's listen callback, so logs must reach pino without listen.
it('prints Nest logger warnings before listen when logs are buffered', async () => {
  const app = await NestFactory.create(ProbeModule, { bufferLogs: true })
  usePathwaysLogger(app)
  new Logger('Probe').warn('probe warning')
  await app.close()

  const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
  expect(entries).toContainEqual(
    expect.objectContaining({ level: 40, context: 'Probe', msg: 'probe warning' }),
  )
})
