/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SavedForm } from '../../collection.utils'
import { FormsGeneratorView } from './forms-generator-view'

// Radix Select cannot open in jsdom, so the trigger and options are rendered as a native select.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type Part = {
    children?: React.ReactNode
    value?: string
    placeholder?: string
    'aria-label'?: string
  }
  const SelectTrigger = (_props: Part) => null
  const SelectValue = (_props: Part) => null
  const SelectContent = ({ children }: Part) => <>{children}</>
  const SelectItem = ({ children, value }: Part) => <option value={value}>{children}</option>
  const Select = ({
    children,
    value,
    disabled,
    onValueChange,
  }: Part & { disabled?: boolean; onValueChange?: (value: string) => void }) => {
    const parts = React.Children.toArray(children) as React.ReactElement<Part>[]
    const trigger = parts.find((part) => part.type === SelectTrigger)
    const content = parts.find((part) => part.type === SelectContent)
    const placeholder = (
      React.Children.toArray(trigger?.props.children) as React.ReactElement<Part>[]
    ).find((part) => part.type === SelectValue)?.props.placeholder
    return (
      <select
        aria-label={trigger?.props['aria-label']}
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

afterEach(cleanup)

const form = (id: string, projectId: string, project: string, title: string): SavedForm => ({
  id,
  projectId,
  project,
  title,
  type: 'PUBLISHED',
  fieldCount: 2,
  savedAt: '2026-10-21T00:00:00.000Z',
})

const view = (
  savedForms: SavedForm[],
  initialProjectId = '',
  {
    canPublish = false,
    canExport = false,
    onPublish = vi.fn(async () => {}),
    onDownload = vi.fn(),
  } = {},
) =>
  render(
    <FormsGeneratorView
      canCreate
      canExport={canExport}
      canImport={false}
      canPublish={canPublish}
      errorState={null}
      initialProjectId={initialProjectId}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onDownload={onDownload}
      onPublish={onPublish}
      savedForms={savedForms}
      status="ready"
    />,
  )
const draft = (id: string, title: string): SavedForm => ({
  ...form(id, 'p1', 'Northern Samar', title),
  type: 'DRAFT',
})

describe('FormsGeneratorView export format', () => {
  it('offers the four export formats and exports the chosen one', () => {
    const onDownload = vi.fn()
    view([form('f1', 'p1', 'Northern Samar', 'Coaching Attendance')], '', {
      canExport: true,
      onDownload,
    })
    const select = screen.getByLabelText('Download format') as HTMLSelectElement
    expect(select.value).toBe('csv')
    expect([...select.options].map((o) => o.textContent).slice(1)).toEqual([
      'CSV',
      'XLSX',
      'XLS',
      'PDF',
    ])
    fireEvent.change(select, { target: { value: 'xlsx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Export form' }))
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), 'xlsx')
  })

  it('shows no format or export without forms.export', () => {
    view([form('f1', 'p1', 'Northern Samar', 'Coaching Attendance')])
    expect(screen.queryByLabelText('Download format')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export form' })).toBeNull()
  })
})

describe('FormsGeneratorView project picker', () => {
  it('lists no forms until a project is picked, then only that project', () => {
    view([
      form('f1', 'p1', 'Northern Samar', 'Coaching Attendance'),
      form('f2', 'p2', 'Safe Schools', 'Registration'),
    ])
    const project = screen.getByLabelText('Project') as HTMLSelectElement
    expect(project.selectedOptions[0]?.textContent).toBe('Select project')
    expect(screen.getByText('Select a project to see its forms.')).toBeTruthy()
    expect(screen.queryByText('Coaching Attendance')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add new' })).toBeTruthy()

    fireEvent.change(project, { target: { value: 'p2' } })
    expect(screen.getByText('Registration')).toBeTruthy()
    expect(screen.queryByText('Coaching Attendance')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Safe Schools' })).toBeNull()
  })

  it('picks the only project automatically', () => {
    view([form('f1', 'p1', 'Northern Samar', 'Coaching Attendance')])
    expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('p1')
    expect(screen.getByText('Coaching Attendance')).toBeTruthy()
  })

  it('keeps the project the person last worked in when it returns from the builder', () => {
    view(
      [
        form('f1', 'p1', 'Northern Samar', 'Coaching Attendance'),
        form('f2', 'p2', 'Safe Schools', 'Registration'),
      ],
      'p2',
    )
    expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe('p2')
    expect(screen.getByText('Registration')).toBeTruthy()
  })
})

describe('FormsGeneratorView publishing drafts', () => {
  const forms = () => [
    draft('d1', 'LST Survey - v1'),
    draft('d2', 'Alumni Survey - v1'),
    form('f1', 'p1', 'Northern Samar', 'Registration - v1'),
  ]

  it('publishes the drafts that are selected', async () => {
    const onPublish = vi.fn(async () => {})
    view(forms(), '', { canPublish: true, onPublish })
    const publish = screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    expect(screen.queryByRole('checkbox', { name: 'Select Registration - v1' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select LST Survey - v1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish (1)' }))
    await waitFor(() => expect(onPublish).toHaveBeenCalledWith(['d1']))
  })

  it('select all picks every draft of the project', () => {
    view(forms(), '', { canPublish: true })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all drafts' }))
    expect(screen.getByRole('button', { name: 'Publish (2)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all drafts' }))
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy()
  })

  it('offers no selection or publish without forms.publish', () => {
    view(forms())
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull()
  })
})
