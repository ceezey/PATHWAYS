'use client'

import { useId } from 'react'

import { cn } from '@/lib/utils'

type FilterChoiceGroupProps = {
  className?: string
  label: string
  onValueChange: (value: string) => void
  options: readonly string[]
  value: string
}

export const FilterChoiceGroup = ({
  className,
  label,
  onValueChange,
  options,
  value,
}: FilterChoiceGroupProps) => {
  const name = useId()

  return (
    <div
      aria-label={label}
      className={cn(
        'inline-flex h-auto items-center justify-center rounded-md border border-border bg-card p-1 text-muted-foreground',
        className,
      )}
      role="radiogroup"
    >
      {options.map((option) => (
        <label key={option} className="cursor-pointer">
          <input
            checked={value === option}
            className="peer sr-only"
            name={name}
            onChange={() => onValueChange(option)}
            type="radio"
            value={option}
          />
          <span className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 peer-checked:bg-primary-subtle peer-checked:text-light-blue-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
            {option}
          </span>
        </label>
      ))}
    </div>
  )
}
