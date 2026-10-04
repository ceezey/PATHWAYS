import { describe, expect, it } from 'vitest'

import type { JourneyStageConfig } from '@/types/pathways'

import { validateStages } from './journey-config-utils'

const stage = (code: string) =>
  ({ id: code, code, name: 'Stage', type: 'Core' }) as JourneyStageConfig

describe('validateStages code rule', () => {
  it('accepts dotted branch codes', () => {
    expect(validateStages([stage('J1'), stage('J3.1')])).toBe('')
  })

  it('names the allowed characters for an invalid code', () => {
    expect(validateStages([stage('J3 1')])).toMatch(/dots, dashes or underscores/)
  })
})
