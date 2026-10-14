// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { captureRequestOwner } from './request-owner'

describe('captureRequestOwner outside the browser', () => {
  it('fails because there is no document to read the workspace cookie from', () => {
    expect(typeof document).toBe('undefined')
    expect(captureRequestOwner()()).toBe(false)
  })
})
