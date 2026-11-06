/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'

import type { FormField } from '../../collection.utils'
import { emptyIntake } from '../digital-form-contract'
import { type OperationGuard, useFormFields } from './use-form-fields'

const toasts = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toasts }))

const field = (id: string): FormField => ({
  id,
  label: `Field ${id}`,
  code: id,
  type: 'text',
  required: false,
  metadataKey: false,
  sadddField: false,
  allowedValues: [],
  minimumValue: '',
  maximumValue: '',
  minimumLength: '',
  maximumLength: '',
  mappingStatus: 'mapped',
  ...emptyIntake,
})
const initial = [field('a'), field('b'), field('c')]
const guard = (): OperationGuard => ({
  mutation: { current: null },
  intent: { current: 0 },
  mounted: { current: true },
  isCurrentOwner: () => true,
})
const ids = (fields: FormField[]) => fields.map((item) => item.id)

describe('useFormFields', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    vi.useRealTimers()
    document.getElementById('collection-field-choice-c')?.remove()
  })

  it('starts on the first field', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    expect(ids(result.current.fields)).toEqual(['a', 'b', 'c'])
    expect(result.current.selectedFieldId).toBe('a')
    expect(result.current.pendingDeleteField).toBeNull()
  })

  it('adds a numbered unmapped field, selects it and counts the edit', () => {
    const operation = guard()
    const { result } = renderHook(() => useFormFields(initial, operation))
    act(() => result.current.addField())
    const added = result.current.fields[3]
    expect(added).toMatchObject({
      label: 'New field 4',
      code: 'new_field_4',
      type: 'text',
      mappingStatus: 'unmapped',
      ...emptyIntake,
    })
    expect(result.current.selectedFieldId).toBe(added.id)
    expect(operation.intent.current).toBe(1)
  })

  it('patches only the named field', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.updateField('b', { label: 'Renamed', required: true }))
    expect(result.current.fields.map((item) => item.label)).toEqual([
      'Field a',
      'Renamed',
      'Field c',
    ])
    expect(result.current.fields[1].required).toBe(true)
    expect(result.current.fields[0].required).toBe(false)
  })

  it('moves a field up or down and ignores a move past either end', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.moveField('b', 'up'))
    expect(ids(result.current.fields)).toEqual(['b', 'a', 'c'])
    act(() => result.current.moveField('b', 'up'))
    expect(ids(result.current.fields)).toEqual(['b', 'a', 'c'])
    act(() => result.current.moveField('b', 'down'))
    act(() => result.current.moveField('b', 'down'))
    act(() => result.current.moveField('b', 'down'))
    expect(ids(result.current.fields)).toEqual(['a', 'c', 'b'])
    act(() => result.current.moveField('missing', 'down'))
    expect(ids(result.current.fields)).toEqual(['a', 'c', 'b'])
  })

  it('asks before deleting, then removes the field and selects its neighbour', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.setSelectedFieldId('b'))
    act(() => result.current.requestDeleteField('b'))
    expect(result.current.pendingDeleteField?.id).toBe('b')
    expect(ids(result.current.fields)).toEqual(['a', 'b', 'c'])
    act(() => result.current.confirmDeleteField())
    expect(ids(result.current.fields)).toEqual(['a', 'c'])
    expect(result.current.selectedFieldId).toBe('c')
    expect(result.current.pendingDeleteField).toBeNull()
    expect(toasts.success).toHaveBeenCalledWith('Field b deleted from this form.')
  })

  it('keeps the selection when another field is deleted and falls back to the last field', () => {
    const { result } = renderHook(() => useFormFields(initial, guard()))
    act(() => result.current.requestDeleteField('c'))
    act(() => result.current.confirmDeleteField())
    expect(result.current.selectedFieldId).toBe('a')
    act(() => result.current.setSelectedFieldId('b'))
    act(() => result.current.requestDeleteField('b'))
    act(() => result.current.confirmDeleteField())
    expect(ids(result.current.fields)).toEqual(['a'])
    expect(result.current.selectedFieldId).toBe('a')
  })

  it.each(['current', 'unmounted', 'replaced', 'cleared'] as const)(
    'focuses the next field choice after a delete only while the owner is current (%s)',
    (owner) => {
      vi.useFakeTimers()
      const target = document.createElement('button')
      target.id = 'collection-field-choice-c'
      document.body.append(target)
      const owned = { current: true }
      const operation = { ...guard(), isCurrentOwner: () => owned.current }
      const { result } = renderHook(() => useFormFields(initial, operation))
      act(() => result.current.setSelectedFieldId('b'))
      act(() => result.current.requestDeleteField('b'))
      act(() => result.current.confirmDeleteField())
      if (owner === 'unmounted') operation.mounted.current = false
      if (owner === 'replaced') owned.current = false
      if (owner === 'cleared') clearSensitiveDraftStorage()
      act(() => {
        vi.runAllTimers()
      })
      expect(document.activeElement === target).toBe(owner === 'current')
    },
  )

  it('counts every edit as a new intent', () => {
    const operation = guard()
    const { result } = renderHook(() => useFormFields(initial, operation))
    act(() => result.current.updateField('a', { label: 'x' }))
    expect(operation.intent.current).toBe(1)
    act(() => result.current.moveField('a', 'down'))
    expect(operation.intent.current).toBe(2)
    act(() => result.current.requestDeleteField('a'))
    expect(operation.intent.current).toBe(3)
    act(() => result.current.confirmDeleteField())
    expect(operation.intent.current).toBe(4)
  })

  it('ignores every edit while an operation holds the form', () => {
    const operation = guard()
    operation.mutation.current = {}
    const { result } = renderHook(() => useFormFields(initial, operation))
    act(() => {
      result.current.addField()
      result.current.updateField('a', { label: 'x' })
      result.current.moveField('a', 'down')
      result.current.requestDeleteField('a')
      result.current.confirmDeleteField()
    })
    expect(ids(result.current.fields)).toEqual(['a', 'b', 'c'])
    expect(result.current.fields[0].label).toBe('Field a')
    expect(result.current.pendingDeleteField).toBeNull()
    expect(operation.intent.current).toBe(0)
  })
})
