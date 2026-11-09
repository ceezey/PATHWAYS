/* @vitest-environment jsdom */

import type { ProjectMapProject } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ saveMapPin: vi.fn(), resetMapPin: vi.fn() }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: client }))

import { PathwaysClientError } from '@/lib/api/core/request'

import { useMapPinEdit } from '../hooks/use-map-pin-edit'
import { ProjectMapDetailPanel } from './project-map-detail-panel'

const cell = { state: 'AVAILABLE' as const, value: '5', reason: null }
const place = (name: string, saved: boolean, locked: boolean, longitude = 125.4) => ({
  name,
  province: 'Eastern Samar',
  longitude,
  latitude: 11.6,
  saved,
  locked,
  reach: { total: cell, sex: [], disability: cell },
})
const project: ProjectMapProject = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'SSG-ES',
  title: 'Safe Schools for Girls',
  status: 'ON_HOLD',
  implementationArea: 'Borongan City and Guiuan, Eastern Samar',
  places: [place('Borongan', false, false), place('Guiuan', true, true, 125.7)],
  overview: null,
  sadddSex: null,
  sadddDisability: null,
}
const noMessage = 'The requested operation could not be completed.'
const errorWith = (status: number, message = noMessage) =>
  new PathwaysClientError(message, 'invalid', [], status)

const refetch = vi.fn()
const onEdit = vi.fn()
const onSwitch = vi.fn()

// Mirrors the coverage panel: the row Move button sets the editing key.
const Harness = ({
  canEdit = true,
  preview = false,
  fixedKey,
}: { canEdit?: boolean; preview?: boolean; fixedKey?: string }) => {
  const edit = useMapPinEdit(project.id, refetch)
  const [key, setKey] = useState<string | null>(null)
  return (
    <ProjectMapDetailPanel
      canEdit={canEdit}
      edit={edit}
      editingKey={fixedKey ?? key}
      onEdit={(next) => {
        onEdit(next)
        setKey(next)
      }}
      onSwitch={onSwitch}
      preview={preview}
      project={project}
    />
  )
}

const row = (name: string) => screen.getByRole('group', { name: new RegExp(name) })
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  client.saveMapPin.mockResolvedValue(undefined)
  client.resetMapPin.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('ProjectMapDetailPanel', () => {
  it('lists each place as Town centre or Moved with its lock state and reach', () => {
    render(<Harness />)
    expect(screen.getByText('On hold', { exact: false })).toBeTruthy()
    expect(within(row('Borongan')).getByText(/Town centre · Reached: 5/)).toBeTruthy()
    expect(within(row('Guiuan')).getByText(/Moved · Locked/)).toBeTruthy()
    expect(screen.getByText('Open project')).toBeTruthy()
  })

  it('shows no edit buttons without the update permission', () => {
    render(<Harness canEdit={false} />)
    expect(screen.queryByRole('button', { name: 'Move pin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock pin' })).toBeNull()
  })

  it('makes Move and Reset inert on a locked row and offers Unlock', () => {
    render(<Harness />)
    const locked = within(row('Guiuan'))
    const move = locked.getByRole('button', { name: 'Move pin' })
    // Inert but focusable, so the tip stays reachable by keyboard.
    expect(move.getAttribute('aria-disabled')).toBe('true')
    expect(
      locked.getByRole('button', { name: 'Reset to town centre' }).getAttribute('aria-disabled'),
    ).toBe('true')
    fireEvent.click(move)
    expect(screen.queryByLabelText('Longitude')).toBeNull()
    expect(locked.getByRole('button', { name: 'Unlock pin' })).toBeTruthy()
    const open = within(row('Borongan'))
    expect(open.getByRole('button', { name: 'Move pin' }).hasAttribute('aria-disabled')).toBe(false)
  })

  it('shows each button tip on keyboard focus, not only on hover', () => {
    render(<Harness />)
    const move = within(row('Borongan')).getByRole('button', { name: 'Move pin' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(move)
    expect(screen.getByRole('tooltip').textContent).toBe('Move pin')
    fireEvent.blur(move)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('returns focus to the Move button when Cancel closes the form', () => {
    render(<Harness />)
    fireEvent.click(within(row('Borongan')).getByRole('button', { name: 'Move pin' }))
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.click(cancel)
    expect(document.activeElement).toBe(
      within(row('Borongan')).getByRole('button', { name: 'Move pin' }),
    )
  })

  it('saves the typed position and keeps the lock as it was', async () => {
    render(<Harness />)
    fireEvent.click(within(row('Borongan')).getByRole('button', { name: 'Move pin' }))
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('125.4')
    type('Longitude', '125.5')
    type('Latitude', '11.7')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onEdit).toHaveBeenLastCalledWith(null))
    expect(client.saveMapPin).toHaveBeenCalledWith(project.id, {
      name: 'Borongan',
      province: 'Eastern Samar',
      longitude: 125.5,
      latitude: 11.7,
      locked: false,
    })
    expect(refetch).toHaveBeenCalled()
  })

  it('locks a pin with the position exactly as received', async () => {
    render(<Harness />)
    fireEvent.click(within(row('Borongan')).getByRole('button', { name: 'Lock pin' }))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
    expect(client.saveMapPin).toHaveBeenCalledWith(project.id, {
      name: 'Borongan',
      province: 'Eastern Samar',
      longitude: 125.4,
      latitude: 11.6,
      locked: true,
    })
  })

  it('unlocks a pin with the position exactly as received', async () => {
    render(<Harness />)
    fireEvent.click(within(row('Guiuan')).getByRole('button', { name: 'Unlock pin' }))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
    expect(client.saveMapPin).toHaveBeenCalledWith(project.id, {
      name: 'Guiuan',
      province: 'Eastern Samar',
      longitude: 125.7,
      latitude: 11.6,
      locked: false,
    })
  })

  it('resets a pin to its town centre', async () => {
    render(<Harness />)
    fireEvent.click(within(row('Borongan')).getByRole('button', { name: 'Reset to town centre' }))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
    expect(client.resetMapPin).toHaveBeenCalledWith(project.id, {
      name: 'Borongan',
      province: 'Eastern Samar',
    })
  })

  it('says the pin is locked on a 409, reloads the map and ends the edit', async () => {
    client.saveMapPin.mockRejectedValue(errorWith(409))
    render(<Harness fixedKey={`${project.id}:0`} />)
    type('Longitude', '125.5')
    type('Latitude', '11.7')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toBe('This pin is locked.')
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenLastCalledWith(null)
  })

  it('shows the server reason when a 409 says the pin changed', async () => {
    client.saveMapPin.mockRejectedValue(errorWith(409, 'This pin changed. Try again.'))
    render(<Harness fixedKey={`${project.id}:0`} />)
    type('Longitude', '125.5')
    type('Latitude', '11.7')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toBe('This pin changed. Try again.')
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('closes the form without a request when Save keeps the same position', () => {
    render(<Harness />)
    fireEvent.click(within(row('Borongan')).getByRole('button', { name: 'Move pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(client.saveMapPin).not.toHaveBeenCalled()
    expect(onEdit).toHaveBeenLastCalledWith(null)
    expect(screen.queryByLabelText('Longitude')).toBeNull()
  })

  it('names the map area on a 400, returns the inputs to the saved spot and ends the edit', async () => {
    client.saveMapPin.mockRejectedValue(errorWith(400))
    render(<Harness fixedKey={`${project.id}:0`} />)
    type('Longitude', '200')
    type('Latitude', '50')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Pick a spot inside the Philippines map area.',
    )
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('125.4')
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('11.6')
    expect(onEdit).toHaveBeenLastCalledWith(null)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('keeps the edit open on any other failure', async () => {
    client.saveMapPin.mockRejectedValue(errorWith(500))
    render(<Harness fixedKey={`${project.id}:0`} />)
    type('Longitude', '125.5')
    type('Latitude', '11.7')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toBe('The pin could not be saved.')
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('does not save empty inputs', () => {
    render(<Harness fixedKey={`${project.id}:0`} />)
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('cancels an edit without writing', () => {
    render(<Harness />)
    fireEvent.click(within(row('Borongan')).getByRole('button', { name: 'Move pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onEdit).toHaveBeenLastCalledWith(null)
    expect(client.saveMapPin).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Longitude')).toBeNull()
  })

  it('offers the filter switch and no edit buttons in a preview', () => {
    render(<Harness preview />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch filter to this project' }))
    expect(onSwitch).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Move pin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unlock pin' })).toBeNull()
  })
})
