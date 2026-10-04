import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type Option = { value: string; label: string }

/** Thin ui Select wrapper that keeps native form semantics (name, required) for FormData readers. */
export function OptionSelect({
  id,
  name,
  options,
  placeholder,
  label,
  describedBy,
  ...props
}: {
  id: string
  name?: string
  options: Option[]
  placeholder?: string
  label?: string
  describedBy?: string
  value?: string
  defaultValue?: string
  required?: boolean
  onValueChange?: (value: string) => void
}) {
  return (
    <Select name={name} {...props}>
      <SelectTrigger id={id} aria-label={label} aria-describedby={describedBy}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** DSD inline notice: tinted bordered strip with a polite live region. */
export function InlineNotice({
  children,
  tone = 'info',
}: { children: React.ReactNode; tone?: 'info' | 'danger' }) {
  return (
    <div
      aria-live="polite"
      role={tone === 'danger' ? 'alert' : 'status'}
      className={
        tone === 'danger'
          ? 'rounded-lg border border-danger/25 bg-danger-subtle p-3 text-sm text-danger'
          : 'rounded-lg border border-info/30 bg-info-subtle p-3 text-sm text-foreground'
      }
    >
      {children}
    </div>
  )
}
