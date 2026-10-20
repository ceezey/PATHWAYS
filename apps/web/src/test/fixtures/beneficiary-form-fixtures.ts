import { beneficiaryRegistrationFieldRules } from '@pathways/shared'
import { fireEvent, screen } from '@testing-library/react'
import type { ChangeEvent, ReactNode } from 'react'

import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'

import { mockProjects } from './projects'

// The stand-in for the Radix select that the form tests drive with change events.
export const selectMock = async () => {
  const { Children, createElement, isValidElement } = await import('react')
  const SelectContent = () => null
  const SelectItem = () => null
  const SelectTrigger = () => null
  return {
    Select: ({
      children,
      disabled,
      onValueChange,
      value,
    }: {
      children: ReactNode
      disabled?: boolean
      onValueChange?: (value: string) => void
      value?: string
    }) => {
      let triggerProps: Record<string, unknown> = {}
      const options: ReactNode[] = []
      Children.forEach(children, (child) => {
        if (!isValidElement(child)) return
        if (child.type === SelectTrigger) triggerProps = child.props as Record<string, unknown>
        if (child.type !== SelectContent) return
        Children.forEach((child.props as { children?: ReactNode }).children, (item) => {
          if (!isValidElement(item) || item.type !== SelectItem) return
          const props = item.props as { children?: ReactNode; value: string }
          options.push(
            createElement('option', { key: props.value, value: props.value }, props.children),
          )
        })
      })
      return createElement(
        'select',
        {
          ...triggerProps,
          disabled,
          value,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => onValueChange?.(event.target.value),
        },
        options,
      )
    },
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue: () => null,
  }
}

export const profileState = {
  userId: 'actor-a',
  organizationId: 'org-a',
  roles: ['PROJECT_OFFICER'],
  permissions: ['beneficiaries.records.register', 'beneficiaries.profiles.update'],
  assignedProjectIds: mockProjects.map((p) => p.id),
}
export const draftKey = (projectId: string | null = null) =>
  sensitiveDraftKey('beneficiary', {
    userId: profileState.userId,
    organizationId: profileState.organizationId,
    projectId,
    resourceId: null,
  })
export const validDraft = {
  code: 'BEN-C3-NEW-001',
  firstName: 'Synthetic',
  middleName: '',
  lastName: 'Person',
  sex: 'Not specified',
  birthDate: '2000-01-01',
  age: '',
  disabilityStatus: 'Not specified',
  province: 'Test Province',
  city: 'Test City',
  barangay: 'Test Barangay',
  consentToParticipate: true,
  consentToStoreData: true,
  isMinor: false,
  guardianConsent: false,
  projectId: mockProjects[0]?.id ?? 'project-a',
}

export const context = (
  definitions: { id: string; version: number; status?: string; formType?: string }[],
) => ({
  projectId: validDraft.projectId,
  businessDate: '2026-09-27',
  definitions: definitions.map((definition) => ({
    ...definition,
    code: 'REGISTRATION',
    name: 'Registration',
    status: 'PUBLISHED' as const,
    formType: 'BENEFICIARY_REGISTRATION' as const,
    fields: Object.entries(beneficiaryRegistrationFieldRules).map(([code, rule], index) => ({
      id: code,
      code,
      label: code,
      dataType: rule.dataType,
      required: 'required' in rule ? rule.required : false,
      allowedValues: 'allowedValues' in rule ? [...rule.allowedValues] : null,
      metadataKey: false,
      sadddField: false,
      sequence: index + 1,
    })),
  })),
})
export const completeSelects = async () => {
  fireEvent.change(screen.getByRole('combobox', { name: /Project enrollment/ }), {
    target: { value: validDraft.projectId },
  })
  fireEvent.change(screen.getByRole('combobox', { name: /Sex/ }), {
    target: { value: validDraft.sex },
  })
  fireEvent.change(screen.getByRole('combobox', { name: /Disability status/ }), {
    target: { value: validDraft.disabilityStatus },
  })
}
