/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplyToFields } from './apply-to-fields'

// Every catalog scope has a metric today, so Budget is made unavailable to reach that branch.
vi.mock('../rules.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rules.utils')>()
  return {
    ...actual,
    availableMetrics: (scopes?: readonly string[]) =>
      scopes?.[0] === 'Budget' ? [] : actual.availableMetrics(scopes as never),
  }
})

afterEach(cleanup)

const projects = [
  { id: 'proj-a', title: 'Project A' },
  { id: 'proj-b', title: 'Project B' },
]
const renderFields = (props: Partial<React.ComponentProps<typeof ApplyToFields>> = {}) => {
  const onToggle = vi.fn()
  const onProject = vi.fn()
  render(
    <ApplyToFields
      locked={false}
      onProject={onProject}
      onToggle={onToggle}
      projects={projects}
      scopeProjectId={null}
      scopes={['Project']}
      {...props}
    />,
  )
  return { onToggle, onProject, select: screen.getByLabelText('Rule scope') as HTMLSelectElement }
}

describe('ApplyToFields', () => {
  it('disables the scope select only when locked', () => {
    expect(renderFields({ locked: true }).select.disabled).toBe(true)
    cleanup()
    expect(renderFields({ locked: false }).select.disabled).toBe(false)
  })
  it('offers the organization template first and selects it when no project is set', () => {
    const { select } = renderFields()
    expect(Array.from(select.options).map((option) => [option.value, option.text])).toEqual([
      ['', 'Organization template'],
      ['proj-a', 'Project A'],
      ['proj-b', 'Project B'],
    ])
    expect(select.value).toBe('')
  })
  it('selects the current project and reports a project change', () => {
    const { select, onProject } = renderFields({ scopeProjectId: 'proj-b' })
    expect(select.value).toBe('proj-b')
    fireEvent.change(select, { target: { value: 'proj-a' } })
    expect(onProject).toHaveBeenLastCalledWith('proj-a')
    fireEvent.change(select, { target: { value: '' } })
    expect(onProject).toHaveBeenLastCalledWith('')
  })
  it('checks only the chosen scopes and reports the toggled scope', () => {
    const { onToggle } = renderFields({ scopes: ['Project', 'Activity'] })
    const checked = (name: string) =>
      (screen.getByRole('checkbox', { name }) as HTMLInputElement).checked
    expect([checked('Project'), checked('Activity'), checked('Indicator')]).toEqual([
      true,
      true,
      false,
    ])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Indicator' }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(onToggle).toHaveBeenCalledWith('Indicator')
  })
  it('disables a scope without a catalog metric and describes why', () => {
    renderFields({ scopes: ['Budget'] })
    const budget = screen.getByRole('checkbox', { name: /^Budget/ }) as HTMLInputElement
    expect(budget.disabled).toBe(true)
    expect(budget.getAttribute('aria-describedby')).toBe('scope-unavailable-Budget')
    expect(document.getElementById('scope-unavailable-Budget')?.textContent).toBe(
      'Not in the rule metric catalog yet',
    )
    const project = screen.getByRole('checkbox', { name: 'Project' }) as HTMLInputElement
    expect(project.disabled).toBe(false)
    expect(project.hasAttribute('aria-describedby')).toBe(false)
  })
})
