// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authUserId = '11111111-1111-4111-8111-111111111111'
const session = { access_token: 'synthetic-token', user: { id: authUserId } }
const mfaStatus = {
  authUserId,
  aal: 'aal1',
  enrollmentAllowed: true,
  applicationAccessEnabled: true,
}
const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  enroll: vi.fn(),
  getSession: vi.fn(),
}))
// The browser client is a singleton in the app; a fresh object per render would restart effects.
const client = vi.hoisted(() => ({
  auth: {
    getSession: (...args: unknown[]) => mfa.getSession(...args),
    mfa: {
      listFactors: (...args: unknown[]) => mfa.listFactors(...args),
      enroll: (...args: unknown[]) => mfa.enroll(...args),
    },
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    session,
    status: 'authenticated',
    configured: true,
    refreshSession: vi.fn(),
    signOut: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'mfa_required',
    mfaStatus,
    accessError: null,
    accessRefreshing: false,
    refreshAccess: vi.fn(),
    claimWorkspaceHandoff: vi.fn(),
    resetWorkspaceHandoff: vi.fn(),
  }),
}))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => client }))
vi.mock('./auth-access', async (original) => ({
  ...(await original<object>()),
  requestAuthJson: vi.fn(async () => mfaStatus),
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const clipboardWriteText = vi.hoisted(() => vi.fn())

import { MfaForm } from './mfa-form'

beforeEach(() => {
  mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null })
  mfa.getSession.mockResolvedValue({ data: { session }, error: null })
  mfa.enroll.mockResolvedValue({
    data: {
      id: '22222222-2222-4222-8222-222222222222',
      totp: {
        qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        secret: 'JBSWY3DPEHPK3PXP',
      },
    },
    error: null,
  })
  clipboardWriteText.mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText: clipboardWriteText } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const fillCode = (digits: string) => {
  const boxes = screen.getAllByLabelText(/Digit \d of 6/)
  digits.split('').forEach((digit, index) => {
    fireEvent.change(boxes[index], { target: { value: digit } })
  })
  return boxes
}

describe('MfaForm enrollment', () => {
  it('shows the QR first, with the setup key collapsed behind a details toggle', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))

    expect(await screen.findByAltText('Private authenticator setup QR code')).toBeTruthy()
    const summary = await screen.findByText("Can't scan? Enter key manually")
    const details = summary.closest('details')
    expect(details?.open).toBe(false)
    expect(mfa.enroll).toHaveBeenCalledOnce()

    fireEvent.click(summary)
    expect(details?.open).toBe(true)
    const key = await screen.findByText('JBSW Y3DP EHPK 3PXP')
    expect(key).toBeTruthy()
  })

  it('copies the setup key to the clipboard and shows a success toast', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')
    fireEvent.click(await screen.findByText("Can't scan? Enter key manually"))
    await screen.findByText('JBSW Y3DP EHPK 3PXP')

    fireEvent.click(screen.getByRole('button', { name: 'Copy key' }))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Setup key copied.'))
  })

  it('clears the setup key from the page when it is hidden', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')
    fireEvent.click(await screen.findByText("Can't scan? Enter key manually"))
    await screen.findByText('JBSW Y3DP EHPK 3PXP')
    fireEvent(window, new Event('pagehide'))
    await waitFor(() => expect(screen.queryByText('JBSW Y3DP EHPK 3PXP')).toBeNull())
    expect(screen.queryByAltText('Private authenticator setup QR code')).toBeNull()
  })

  it('shows no setup key before the explicit enrollment click', async () => {
    render(<MfaForm />)
    await screen.findByRole('button', { name: 'Set up authenticator' })
    expect(screen.queryByText(/Can't scan\?/)).toBeNull()
    expect(mfa.enroll).not.toHaveBeenCalled()
  })
})

describe('MfaForm code entry', () => {
  it('renders six single-digit boxes as a labelled group and auto-advances while typing', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')

    const group = screen.getByRole('group', { name: 'Authenticator code' })
    const boxes = screen.getAllByLabelText(/Digit \d of 6/)
    expect(boxes).toHaveLength(6)
    for (const box of boxes) {
      expect(group.contains(box)).toBe(true)
    }

    fireEvent.change(boxes[0], { target: { value: '1' } })
    expect(boxes[1]).toBe(document.activeElement)
    fireEvent.change(boxes[1], { target: { value: '2' } })
    expect(boxes[2]).toBe(document.activeElement)
  })

  it('moves focus back on backspace from an empty box', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')

    const boxes = screen.getAllByLabelText(/Digit \d of 6/)
    fireEvent.change(boxes[0], { target: { value: '1' } })
    fireEvent.change(boxes[1], { target: { value: '2' } })
    boxes[2].focus()
    fireEvent.keyDown(boxes[2], { key: 'Backspace' })
    expect(boxes[1]).toBe(document.activeElement)
    fireEvent.keyDown(boxes[1], { key: 'Backspace' })
    expect((boxes[1] as HTMLInputElement).value).toBe('')
  })

  it('fills all boxes when six digits are pasted', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')

    const boxes = screen.getAllByLabelText(/Digit \d of 6/)
    const clipboardData = { getData: () => '123456' }
    fireEvent.paste(boxes[0], { clipboardData })
    boxes.forEach((box, index) => {
      expect((box as HTMLInputElement).value).toBe(String(index + 1))
    })
  })

  it('keeps submit disabled until all six digits are entered, and codes are not masked', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')

    const submit = screen.getByRole('button', {
      name: 'Verify authenticator code',
    }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    const boxes = fillCode('12345')
    expect(submit.disabled).toBe(true)
    for (const box of boxes) {
      expect(box.getAttribute('type')).toBe('text')
    }

    fillCode('123456')
    expect(submit.disabled).toBe(false)
  })

  it('does not shift later digits when a middle box is deleted', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')

    const boxes = fillCode('123456')
    fireEvent.change(boxes[2], { target: { value: '' } })

    expect(boxes.map((box) => (box as HTMLInputElement).value)).toEqual([
      '1',
      '2',
      '',
      '4',
      '5',
      '6',
    ])
  })

  it('fills the first gap instead of the clicked box when typing past a gap', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')

    const boxes = screen.getAllByLabelText(/Digit \d of 6/)
    fireEvent.change(boxes[0], { target: { value: '1' } })
    fireEvent.change(boxes[1], { target: { value: '2' } })
    // Box index 2 is still empty; typing into box 4 (index 4) should land in
    // box 3 (index 2), the first empty box, not jump ahead.
    fireEvent.change(boxes[4], { target: { value: '9' } })

    expect(boxes.map((box) => (box as HTMLInputElement).value)).toEqual(['1', '2', '9', '', '', ''])
  })

  it('resets all boxes when the value prop is externally cleared', async () => {
    render(<MfaForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }))
    await screen.findByAltText('Private authenticator setup QR code')

    const boxes = fillCode('123456')
    // Submitting a wrong code resets the controlled `value` prop back to ''.
    fireEvent.click(screen.getByRole('button', { name: 'Verify authenticator code' }))

    await waitFor(() =>
      expect(boxes.map((box) => (box as HTMLInputElement).value)).toEqual(['', '', '', '', '', '']),
    )
  })
})
