/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

const view = (savedForms: SavedForm[]) =>
  render(
    <FormsGeneratorView
      canCreate
      canImport={false}
      errorState={null}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onDownload={vi.fn()}
      savedForms={savedForms}
      status="ready"
    />,
  )

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
})
