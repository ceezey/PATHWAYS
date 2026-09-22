/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'

import { ConfirmationDialog } from './confirmation-dialog'

afterEach(() => cleanup())

const ConfirmationHarness = ({ onConfirm }: { onConfirm: () => void }) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>Delete example field</Button>
      <ConfirmationDialog
        confirmLabel="Delete example field"
        description="This removes the example field from the current form."
        onConfirm={onConfirm}
        onOpenChange={setOpen}
        open={open}
        title="Delete Example field?"
      />
    </>
  )
}

describe('ConfirmationDialog', () => {
  it('starts on Cancel and preserves cancellation before a contextual commit', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmationHarness onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete example field' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Example field?' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })

    await waitFor(() => expect(document.activeElement).toBe(cancel))
    expect(dialog.textContent).toContain('example field from the current form')
    fireEvent.click(cancel)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Delete Example field?' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Delete example field' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete example field' }),
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
