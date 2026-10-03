import 'reflect-metadata'

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'

import { JourneyStageInputDto } from './activities.dto'

const codeErrors = async (code: string) =>
  (await validate(plainToInstance(JourneyStageInputDto, { code }))).filter(
    (error) => error.property === 'code',
  )

describe('journey stage code rule', () => {
  it.each(['J1', 'J3.1', 'J3-1', 'FOLLOW_UP'])('accepts %s', async (code) => {
    expect(await codeErrors(code)).toEqual([])
  })

  it.each(['J', '.J3', 'J3 1', 'J3/1'])('rejects %s', async (code) => {
    expect((await codeErrors(code)).length).toBeGreaterThan(0)
  })
})
