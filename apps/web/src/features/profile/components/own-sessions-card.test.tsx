/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ list: vi.fn(), end: vi.fn(), endOthers: vi.fn() }))
vi.mock('@/lib/api/sessions', () => ({ sessionsClient: client }))

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

beforeEach(() => {
  client.list.mockReset().mockResolvedValue([current, phone])
  client.end.mockReset().mockResolvedValue(undefined)
  client.endOthers.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('signed-in devices', () => {
  it('lists each device and marks this one, which has no sign-out button', async () => {
    render(<OwnSessionsCard />)
    expect(await screen.findByText('Chrome on Windows')).toBeTruthy()
    expect(screen.getByText('This device')).toBeTruthy()
    expect(screen.getByText('Chrome on Android')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(1)
  })

  it('signs out one other device and reloads the list', async () => {
    render(<OwnSessionsCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(client.end).toHaveBeenCalledWith('s-2'))
    expect(await screen.findByText('That device was signed out.')).toBeTruthy()
    expect(client.list).toHaveBeenCalledTimes(2)
  })

  it('signs out every other device', async () => {
    render(<OwnSessionsCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out other devices' }))
    await waitFor(() => expect(client.endOthers).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Your other devices were signed out.')).toBeTruthy()
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
