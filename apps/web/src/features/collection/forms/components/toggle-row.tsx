'use client'

export const ToggleRow = ({
  checked,
  disabled = false,
  label,
  name,
  type = 'checkbox',
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  /** A radio row needs the group name its siblings share. */
  name?: string
  type?: 'checkbox' | 'radio'
  onChange: (checked: boolean) => void
}) => (
  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-info-subtle has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
    <span className="font-medium text-foreground">{label}</span>
    <input
      checked={checked}
      disabled={disabled}
      className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      name={name}
      type={type}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
)
