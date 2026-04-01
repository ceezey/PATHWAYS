import { describe, expect, it } from 'vitest'

import { readApiEnv, readWebEnv } from './env'

describe('env readers', () => {
  it('applies defaults for web envs', () => {
    expect(readWebEnv({}).WEB_PORT).toBe(3000)
  })

  it('applies defaults for api envs', () => {
    expect(readApiEnv({}).API_PORT).toBe(4000)
  })
})
