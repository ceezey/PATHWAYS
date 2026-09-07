import webPackage from '../package.json'

import { describe, expect, it } from 'vitest'

describe('local web listener', () => {
  it('pins both supported local server commands to IPv4 loopback', () => {
    expect(webPackage.scripts.predev).toBe('node scripts/assert-dev-port-free.mjs')
    expect(webPackage.scripts.dev).toBe('next dev --hostname 127.0.0.1 --port 3000')
    expect(webPackage.scripts.start).toBe('next start --hostname 127.0.0.1 --port 3000')
  })
})
