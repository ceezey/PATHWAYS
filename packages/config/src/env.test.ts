import { describe, expect, it } from 'vitest'

import { readApiEnv, readWebEnv } from './env'

describe('env readers', () => {
  it('applies defaults for web envs', () => {
    const env = readWebEnv({})

    expect(env.WEB_PORT).toBe(3000)
    expect(env.STAFF_PORTAL_BASE_URL).toBe('')
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe('http://127.0.0.1:4000/api')
  })

  it('applies defaults for api envs', () => {
    const env = readApiEnv({})

    expect(env.API_PORT).toBe(4000)
    expect(env).not.toHaveProperty('DEV_ADMIN_EMAIL')
    expect(env).not.toHaveProperty('DEV_ADMIN_SUPABASE_ID')
  })
})
