import { describe, expect, it } from 'vitest'

import { readMission } from './uat-mission-widget'

const encode = (o: unknown) => `?mission=${encodeURIComponent(btoa(JSON.stringify(o)))}`

describe('readMission', () => {
  it('reads the mission the start link sends and starts with no progress', () => {
    const m = readMission(
      encode({
        pid: 'p-123456789',
        role: 'PM',
        account: 'Angelica Fernandez',
        env: 'A',
        startedAt: 5,
      }),
    )
    expect(m).toEqual({
      pid: 'p-123456789',
      role: 'PM',
      account: 'Angelica Fernandez',
      env: 'A',
      startedAt: 5,
      current: '',
      credited: {},
      claims: [],
      declined: [],
    })
  })

  it('ignores a missing, malformed or incomplete mission', () => {
    expect(readMission('')).toBeNull()
    expect(readMission('?mission=not-base64!')).toBeNull()
    expect(readMission(encode({ pid: 'p', role: 'PM' }))).toBeNull()
  })
})
