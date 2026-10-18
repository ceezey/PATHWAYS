import type { ChangeEvent, ReactNode } from 'react'

// A native select that stands in for the Radix select by reading its options from the SelectItem children.
export async function selectMock() {
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

export const baseUser = {
  id: 'user-1',
  authUserId: 'auth-user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  role: 'Project Officer' as const,
  accountStatus: 'Active' as const,
  signInMethod: 'Supabase account' as const,
  projectIds: [],
  projectAccess: [],
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
}

export const projectManagerProfile = {
  permissions: ['users.authorize'],
}
