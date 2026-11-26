/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ list: vi.fn(), end: vi.fn(), endOthers: vi.fn() }))
const stepUp = vi.hoisted(() => ({ status: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/api/sessions', () => ({ sessionsClient: client }))
vi.mock('@/lib/auth/beneficiary-step-up', async (original) => ({
  ...(await original<typeof import('@/lib/auth/beneficiary-step-up')>()),
  getBeneficiaryStepUpStatus: stepUp.status,
  verifyBeneficiaryStepUp: stepUp.verify,
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { OwnSessionsCard } from './own-sessions-card'

const at = '2026-11-25T01:00:00.000Z'
const current = {
  id: 's-1',
  device: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0',
  startedAt: at,
  lastActiveAt: at,
  current: true,
}
const phone = {
  id: 's-2',
  device: 'Mozilla/5.0 (Linux; Android 15) Chrome/131.0 Mobile',
  startedAt: at,
  lastActiveAt: at,
  current: false,
}
const stepUpRefusal = () =>
  new PathwaysClientError('Step-up required.', 'forbidden', [], 403, true, 'STEP_UP_TOTP_REQUIRED')
const confirmButton = () => screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement

beforeEach(() => {
  client.list.mockReset().mockResolvedValue([current, phone])
  client.end.mockReset().mockResolvedValue(undefined)
  client.endOthers.mockReset().mockResolvedValue(undefined)
  stepUp.status.mockReset().mockResolvedValue({ fresh: true, method: 'TOTP' })
  stepUp.verify.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('signed-in devices', () => {
  it('lists each device and marks this one, which has no sign-out button', async () => {
    render(<OwnSessionsCard />)
    expect(await screen.findByText('Chrome on Windows')).toBeTruthy()
    expect(screen.getByText('This device')).toBeTruthy()
    expect(screen.getByText('Chrome on Android')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign out Chrome on Windows' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out Chrome on Android' })).toBeTruthy()
  })

  it('signs out one other device after confirming, and reloads the list', async () => {
    render(<OwnSessionsCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Chrome on Android' }))
    await waitFor(() => expect(confirmButton().disabled).toBe(false))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(client.end).toHaveBeenCalledWith('s-2'))
    expect(await screen.findByText('That device was signed out.')).toBeTruthy()
    expect(client.list).toHaveBeenCalledTimes(2)
  })

  it('asks for an authenticator code when none is fresh, then signs out every other device', async () => {
    stepUp.status.mockResolvedValue({ fresh: false, method: null })
    render(<OwnSessionsCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out other devices' }))
    await screen.findByRole('group', { name: 'Authenticator code' })
    expect(confirmButton().disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    })
    fireEvent.click(confirmButton())
    await waitFor(() => expect(client.endOthers).toHaveBeenCalledTimes(1))
    expect(stepUp.verify).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('Your other devices were signed out.')).toBeTruthy()
  })

  it('keeps the dialog open and asks for a code when the API requires one', async () => {
    client.endOthers.mockRejectedValueOnce(stepUpRefusal())
    render(<OwnSessionsCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out other devices' }))
    await waitFor(() => expect(confirmButton().disabled).toBe(false))
    fireEvent.click(confirmButton())
    expect(await screen.findByRole('group', { name: 'Authenticator code' })).toBeTruthy()
    expect(screen.getByText('Enter the code from your authenticator app to continue.')).toBeTruthy()
    expect(screen.queryByText('Your other devices were signed out.')).toBeNull()
  })

  it('hides the bulk action when this is the only device, and reports a failed load', async () => {
    client.list.mockResolvedValueOnce([current])
    const { unmount } = render(<OwnSessionsCard />)
    await screen.findByText('This device')
    expect(screen.queryByRole('button', { name: 'Sign out other devices' })).toBeNull()
    unmount()
    client.list.mockRejectedValueOnce(new Error('offline'))
    render(<OwnSessionsCard />)
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy()
  })
})
