// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'

import { captureRequestOwner } from './request-owner'

afterEach(() => {
  document.cookie = 'pathways-context=; Path=/; Max-Age=0'
})

describe('captureRequestOwner', () => {
  it('stays current while the workspace cookie and draft generation are unchanged', () => {
    document.cookie = 'theme=dark; Path=/'
    document.cookie = 'pathways-context=owner-a; Path=/'
    expect(captureRequestOwner()()).toBe(true)
  })

  it('fails without a workspace cookie', () => {
    expect(captureRequestOwner()()).toBe(false)
  })

  it('fails once the workspace cookie or the draft generation changes', () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    const cookieOwner = captureRequestOwner()
    document.cookie = 'pathways-context=owner-b; Path=/'
    expect(cookieOwner()).toBe(false)
    const generationOwner = captureRequestOwner()
    clearSensitiveDraftStorage()
    expect(generationOwner()).toBe(false)
  })

  it('fails once its signal aborts', () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    const controller = new AbortController()
    const current = captureRequestOwner(controller.signal)
    expect(current()).toBe(true)
    controller.abort()
    expect(current()).toBe(false)
  })
})
