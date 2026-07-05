import { describe, expect, it } from 'vitest'

import { readApiEnv, readWebEnv } from './env'

describe('env readers', () => {
  it('applies defaults for web envs', () => {
    const env = readWebEnv({})

    expect(env.WEB_PORT).toBe(3000)
    expect(env.NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE).toBe(false)
    expect(env.NEXT_PUBLIC_ENABLE_ROLE_PREVIEW).toBe(true)
  })

  it('reads explicit prototype-mode web envs', () => {
    const env = readWebEnv({
      NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE: 'true',
      NEXT_PUBLIC_ENABLE_ROLE_PREVIEW: 'false',
    })

    expect(env.NEXT_PUBLIC_ENABLE_GUI_PROTOTYPE_MODE).toBe(true)
    expect(env.NEXT_PUBLIC_ENABLE_ROLE_PREVIEW).toBe(false)
  })

  it('applies defaults for api envs', () => {
    expect(readApiEnv({}).API_PORT).toBe(4000)
  })
})
