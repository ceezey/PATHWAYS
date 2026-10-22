import { type MutableRefObject, useState } from 'react'
import { toast } from 'sonner'

import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'

import type { FormField } from '../../collection.utils'
import { emptyIntake } from '../digital-form-contract'

// The refs the collection screen shares with the hooks that edit its form.
export interface OperationGuard {
  mutation: MutableRefObject<object | null>
  intent: MutableRefObject<number>
  mounted: MutableRefObject<boolean>
  isCurrentOwner: () => boolean
}

// Holds the form fields being built and the edits that add, move, change and delete them.
export function useFormFields(
  initial: FormField[],
  { mutation, intent, mounted, isCurrentOwner }: OperationGuard,
) {
  const [fields, setFields] = useState<FormField[]>(initial)
  const [selectedFieldId, setSelectedFieldId] = useState(initial[0]?.id ?? '')
  const [pendingDeleteField, setPendingDeleteField] = useState<FormField | null>(null)

  const updateField = (fieldId: string, patch: Partial<FormField>) => {
    if (mutation.current) return
    intent.current++
    setFields((currentFields) =>
      currentFields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    )
  }

  const addField = () => {
    if (mutation.current) return
    intent.current++
    const nextNumber = fields.length + 1
    const field: FormField = {
      id: `field-${Date.now()}`,
      label: `New field ${nextNumber}`,
      code: `new_field_${nextNumber}`,
      type: 'text',
      required: false,
      metadataKey: false,
      sadddField: false,
      allowedValues: [],
      minimumValue: '',
      maximumValue: '',
      minimumLength: '',
      maximumLength: '',
      mappingStatus: 'unmapped',
      ...emptyIntake,
    }

    setFields((currentFields) => [...currentFields, field])
    setSelectedFieldId(field.id)
  }

  const requestDeleteField = (fieldId: string) => {
    if (mutation.current) return
    intent.current++
    setPendingDeleteField(fields.find((field) => field.id === fieldId) ?? null)
  }

  const confirmDeleteField = () => {
    if (mutation.current) return
    intent.current++
    if (!pendingDeleteField) {
      return
    }

    const deletedIndex = fields.findIndex((field) => field.id === pendingDeleteField.id)
    const nextFields = fields.filter((field) => field.id !== pendingDeleteField.id)
    const nextSelectedFieldId =
      selectedFieldId === pendingDeleteField.id
        ? (nextFields[Math.min(deletedIndex, nextFields.length - 1)]?.id ?? '')
        : selectedFieldId

    setFields(nextFields)
    setSelectedFieldId(nextSelectedFieldId)
    setPendingDeleteField(null)
    toast.success(`${pendingDeleteField.label} deleted from this form.`)
    const focusGeneration = sensitiveDraftGeneration()
    window.setTimeout(() => {
      if (!isCurrentOwner() || !mounted.current || focusGeneration !== sensitiveDraftGeneration())
        return
      const focusTargetId = nextSelectedFieldId
        ? `collection-field-choice-${nextSelectedFieldId}`
        : 'collection-add-field'
      document.getElementById(focusTargetId)?.focus()
    }, 0)
  }

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    if (mutation.current) return
    intent.current++
    setFields((currentFields) => {
      const currentIndex = currentFields.findIndex((field) => field.id === fieldId)
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentFields.length) {
        return currentFields
      }

      const nextFields = [...currentFields]
      const [field] = nextFields.splice(currentIndex, 1)
      nextFields.splice(targetIndex, 0, field)
      return nextFields
    })
  }

  return {
    fields,
    setFields,
    selectedFieldId,
    setSelectedFieldId,
    pendingDeleteField,
    setPendingDeleteField,
    updateField,
    addField,
    requestDeleteField,
    confirmDeleteField,
    moveField,
  }
}
