/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Children, createElement, isValidElement } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormDefinitionEntryField } from './form-definition-entry-field'
vi.mock('@/components/ui/select', () => {
  const SelectContent = () => null
  const SelectItem = () => null
  const SelectTrigger = () => null
  return {
    Select: ({
      children,
      value,
      onValueChange,
      disabled,
    }: {
      children: ReactNode
      value: string
      onValueChange: (value: string) => void
      disabled: boolean
    }) => {
      let trigger: Record<string, unknown> = {}
      const options: ReactNode[] = []
      Children.forEach(children, (child) => {
        if (!isValidElement(child)) return
        if (child.type === SelectTrigger) trigger = child.props as Record<string, unknown>
        if (child.type === SelectContent)
          Children.forEach((child.props as { children: ReactNode }).children, (item) => {
            if (!isValidElement(item) || item.type !== SelectItem) return
            const props = item.props as { value: string; children: ReactNode }
            options.push(
              createElement('option', { value: props.value, key: props.value }, props.children),
            )
          })
      })
      return createElement(
        'select',
        {
          ...trigger,
          value,
          disabled,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => onValueChange(event.target.value),
        },
        options,
      )
    },
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue: () => null,
  }
})
afterEach(cleanup)
const field = {
  id: 'test-id',
  code: 'custom_choice',
  label: 'Additional choice',
  dataType: 'SELECT' as const,
  required: true,
  metadataKey: false,
  sadddField: false,
  allowedValues: ['unset', 'unanswered', 'option:unset', 'other'],
}
describe('shared typed definition control compatibility', () => {
  it.each(['unset', 'unanswered', 'option:unset', 'other'])(
    'preserves actual option %s independently of empty sentinel',
    (option) => {
      const onChange = vi.fn()
      render(
        <FormDefinitionEntryField
          disabled={false}
          errors={[]}
          field={field}
          onChange={onChange}
          value={null}
        />,
      )
      fireEvent.change(screen.getByRole('combobox', { name: /Additional choice/ }), {
        target: { value: `option:${option}` },
      })
      expect(onChange).toHaveBeenCalledWith(option)
      fireEvent.change(screen.getByRole('combobox', { name: /Additional choice/ }), {
        target: { value: 'unanswered' },
      })
      expect(onChange).toHaveBeenLastCalledWith(null)
    },
  )
  it.each(['SELECT', 'BOOLEAN', 'TEXT', 'LONG_TEXT'] as const)(
    'announces required %s controls',
    (dataType) => {
      render(
        <FormDefinitionEntryField
          disabled={false}
          errors={[]}
          field={{ ...field, dataType }}
          onChange={vi.fn()}
          value={null}
        />,
      )
      expect(screen.getByLabelText(/Additional choice/).getAttribute('aria-required')).toBe('true')
    },
  )
  it('renders selected unset string as its encoded option', () => {
    render(
      <FormDefinitionEntryField
        disabled={false}
        errors={[]}
        field={field}
        onChange={vi.fn()}
        value="unset"
      />,
    )
    expect(
      (screen.getByRole('combobox', { name: /Additional choice/ }) as HTMLSelectElement).value,
    ).toBe('option:unset')
  })
  it('provides a named focusable required multi-select group and checkbox error association', () => {
    const onChange = vi.fn()
    render(
      <FormDefinitionEntryField
        disabled={false}
        errors={['Choose an option.']}
        field={{ ...field, dataType: 'MULTIPLE_SELECT', minimumLength: 1 }}
        onChange={onChange}
        value={[]}
      />,
    )
    const group = screen.getByRole('group', { name: 'Additional choice (required)' })
    group.focus()
    expect(document.activeElement).toBe(group)
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(group.getAttribute('aria-describedby')).toContain('entry-custom_choice-error')
    expect(screen.getByText('Choose at least 1 option(s).')).toBeTruthy()
    const checkbox = screen.getByRole('checkbox', { name: 'unset' })
    expect(checkbox.getAttribute('aria-describedby')).toBe('entry-custom_choice-error')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(['unset'])
  })
})
