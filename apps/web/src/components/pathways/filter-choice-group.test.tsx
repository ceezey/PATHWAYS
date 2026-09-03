/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FilterChoiceGroup } from './filter-choice-group'

afterEach(() => cleanup())

describe('FilterChoiceGroup', () => {
  it('exposes one checked radio choice and reports changes', () => {
    const onValueChange = vi.fn()
    render(
      <FilterChoiceGroup
        label="Project status filter"
        onValueChange={onValueChange}
        options={['All', 'Active', 'Completed']}
        value="All"
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Project status filter' })
    const radios = screen.getAllByRole('radio')
    expect(group.contains(radios[0])).toBe(true)
    expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1)

    fireEvent.click(screen.getByRole('radio', { name: 'Active' }))
    expect(onValueChange).toHaveBeenCalledWith('Active')
  })
})
