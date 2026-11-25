// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: '' }))
vi.mock('@/lib/env', () => ({ webEnv: env }))

const turnstile = { render: vi.fn(() => 'widget-1'), remove: vi.fn() }
const scripts = () => [...document.head.querySelectorAll('script')]
const load = async () => {
  vi.resetModules()
  return import('./captcha-field')
}
// jsdom fetches no script, so the test stands in for Cloudflare answering or failing.
const answer = (event: 'load' | 'error') =>
  act(async () => scripts()[0]?.dispatchEvent(new Event(event)))

beforeEach(() => {
  turnstile.render.mockClear()
  turnstile.remove.mockClear()
  window.turnstile = turnstile
})
afterEach(() => {
  cleanup()
  for (const script of scripts()) script.remove()
})

describe('CaptchaField', () => {
  it('renders nothing and loads nothing when no site key is set', async () => {
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = ''
    const { CaptchaField, captchaSiteKey } = await load()
    const { container } = render(<CaptchaField onToken={() => undefined} />)
    expect(captchaSiteKey).toBe('')
    expect(container.innerHTML).toBe('')
    expect(scripts()).toHaveLength(0)
  })

  it('loads Turnstile once, hands over the token, clears it on expiry and removes the widget', async () => {
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key'
    const { CaptchaField } = await load()
    const onToken = vi.fn()
    const first = render(<CaptchaField onToken={onToken} />)
    render(<CaptchaField onToken={() => undefined} />)
    expect(scripts().map((script) => script.src)).toEqual([
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    ])
    await answer('load')
    expect(turnstile.render).toHaveBeenCalledTimes(2)
    const options = turnstile.render.mock.calls[0]?.[1] as Record<string, (token: string) => void>
    expect(options.sitekey).toBe('site-key')
    options.callback('token-1')
    expect(onToken).toHaveBeenLastCalledWith('token-1')
    options['expired-callback']('')
    expect(onToken).toHaveBeenLastCalledWith('')
    first.unmount()
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1')
  })

  it('says so when the check cannot load, and never reports a token', async () => {
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key'
    const { CaptchaField } = await load()
    const onToken = vi.fn()
    render(<CaptchaField onToken={onToken} />)
    await answer('error')
    expect(screen.getByRole('alert').textContent).toBe(
      'The security check could not load. Refresh the page.',
    )
    expect(onToken).not.toHaveBeenCalled()
  })
})
