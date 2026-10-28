/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SavedForm } from '../../collection.utils'
import { FormsGeneratorView } from './forms-generator-view'

// Radix Select cannot open in jsdom, so the trigger and options are rendered as a native select.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type Part = { children?: React.ReactNode; value?: string; id?: string }
  const SelectTrigger = (_props: Part) => null
  const SelectValue = (_props: Part) => null
  const SelectContent = ({ children }: Part) => <>{children}</>
  const SelectItem = ({ children, value }: Part) => <option value={value}>{children}</option>
  const Select = ({
    children,
    value,
    onValueChange,
  }: Part & { onValueChange?: (value: string) => void }) => {
    const parts = React.Children.toArray(children) as React.ReactElement<Part>[]
    const trigger = parts.find((part) => part.type === SelectTrigger)
    const content = parts.find((part) => part.type === SelectContent)
    return (
      <select
        id={trigger?.props.id}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
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
      canCreate={false}
      canImport={false}
      errorState={null}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onDownload={vi.fn()}
      savedForms={savedForms}
      status="ready"
    />,
  )

describe('FormsGeneratorView project filter', () => {
  it('shows only the chosen project and returns to all projects', () => {
    view([
      form('f1', 'p1', 'Northern Samar', 'Coaching Attendance'),
      form('f2', 'p2', 'Safe Schools', 'Registration'),
    ])
    const project = screen.getByLabelText('Project')
    expect(screen.getByText('Coaching Attendance')).toBeTruthy()
    expect(screen.getByText('Registration')).toBeTruthy()

    fireEvent.change(project, { target: { value: 'p2' } })
    expect(screen.queryByText('Coaching Attendance')).toBeNull()
    expect(screen.getByText('Registration')).toBeTruthy()

    fireEvent.change(project, { target: { value: 'all' } })
    expect(screen.getByText('Coaching Attendance')).toBeTruthy()
  })

  it('hides the filter when every form belongs to one project', () => {
    view([form('f1', 'p1', 'Northern Samar', 'Coaching Attendance')])
    expect(screen.queryByLabelText('Project')).toBeNull()
  })
})
