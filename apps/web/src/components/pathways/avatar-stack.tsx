import { cn } from '@/lib/utils'

const tints = [
  'bg-primary-subtle text-primary',
  'bg-success-subtle text-success',
  'bg-warning-subtle text-warning',
  'bg-danger-subtle text-danger',
]

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const roleLabel = (role: string) =>
  role
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/** Overlapping initials avatars with a "+N" overflow chip. */
export const AvatarStack = ({
  members,
  max = 4,
  className,
}: {
  members: Array<{ userId: string; fullName: string; role?: string }>
  max?: number
  className?: string
}) => {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  const chip =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-card text-sm font-semibold'
  return (
    <ul className={cn('flex items-center -space-x-2', className)}>
      {shown.map((member, index) => {
        const label = member.role
          ? `${member.fullName}, ${roleLabel(member.role)}`
          : member.fullName
        return (
          <li
            aria-label={label}
            className={cn(chip, tints[index % tints.length])}
            key={member.userId}
            title={label}
          >
            {initialsOf(member.fullName)}
          </li>
        )
      })}
      {extra > 0 ? (
        <li
          aria-label={`${extra} more team members`}
          className={cn(chip, 'bg-muted text-muted-foreground')}
        >
          +{extra}
        </li>
      ) : null}
    </ul>
  )
}
