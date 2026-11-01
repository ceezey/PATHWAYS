'use client'

import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'

export const FilterSelect = ({
  label,
  value,
  placeholder,
  onValueChange,
  children,
}: {
  label: string
  value: string
  placeholder?: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}) => (
  <div className="space-y-2">
    <span className="text-sm font-medium">{label}</span>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  </div>
)
