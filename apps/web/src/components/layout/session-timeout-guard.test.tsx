/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ signOut: vi.fn(), heartbeat: vi.fn(), assign: vi.fn() }))
vi.mock('@/hooks/use-session', () => ({ useSession: () => ({ signOut: state.signOut }) }))
vi.mock('@/lib/api/sessions', () => ({ sessionsClient: { heartbeat: state.heartbeat } }))

import { SESSION_ENDED_EVENT } from '@/lib/api/core/authorized-read-events'
import { LAST_ACTIVE_KEY, SessionTimeoutGuard } from './session-timeout-guard'

const MINUTE = 60_000
// Runs every interval tick in the span, then flushes pending promises.
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  state.signOut.mockReset().mockResolvedValue(undefined)
  state.heartbeat.mockReset().mockResolvedValue(undefined)
  state.assign.mockReset()
  vi.stubGlobal('location', { ...window.location, assign: state.assign })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('session timeout guard', () => {
  it('confirms the session on load, warns at 28 idle minutes and signs out at 30', async () => {
    render(<SessionTimeoutGuard />)
    await advance(0)
    expect(state.heartbeat).toHaveBeenCalledTimes(1)
    await advance(28 * MINUTE)
    expect(screen.getByText('You will be signed out soon')).toBeTruthy()
    expect(screen.getByText(/signed out in 2:00/)).toBeTruthy()
    expect(document.activeElement?.textContent).toBe('Stay signed in')
    await advance(2 * MINUTE)
    expect(state.signOut).toHaveBeenCalledTimes(1)
    expect(state.assign).toHaveBeenCalledWith('/staff/login?ended=idle')
  })

  it('keeps the session while the user works, at most one heartbeat a minute', async () => {
    render(<SessionTimeoutGuard />)
    await advance(0)
    for (let minute = 0; minute < 40; minute += 1) {
      fireEvent.keyDown(window)
      await advance(MINUTE)
    }
    expect(state.signOut).not.toHaveBeenCalled()
    expect(state.heartbeat.mock.calls.length).toBeLessThanOrEqual(41)
    expect(state.heartbeat.mock.calls.length).toBeGreaterThan(30)
  })

  it('does not restart the idle clock when the heartbeat fails', async () => {
    render(<SessionTimeoutGuard />)
    await advance(0)
    state.heartbeat.mockRejectedValue(new Error('offline'))
    await advance(20 * MINUTE)
    fireEvent.pointerDown(window)
    await advance(10 * MINUTE)
    expect(state.assign).toHaveBeenCalledWith('/staff/login?ended=idle')
  })

  it('counts activity confirmed in another tab', async () => {
    render(<SessionTimeoutGuard />)
    await advance(25 * MINUTE)
    window.localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
    await advance(10 * MINUTE)
    expect(state.signOut).not.toHaveBeenCalled()
  })

  it('stays signed in from the warning', async () => {
    render(<SessionTimeoutGuard />)
    await advance(29 * MINUTE)
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
    await advance(1000)
    expect(screen.queryByText('You will be signed out soon')).toBeNull()
    await advance(5 * MINUTE)
    expect(state.signOut).not.toHaveBeenCalled()
  })

  it('signs out at once when the API reports the session ended', async () => {
    render(<SessionTimeoutGuard />)
    await act(async () => {
      window.dispatchEvent(new Event(SESSION_ENDED_EVENT))
    })
    expect(state.signOut).toHaveBeenCalledTimes(1)
    expect(state.assign).toHaveBeenCalledWith('/staff/login?ended=session')
  })
})
