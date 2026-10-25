import { z } from 'zod'

// Expense and budget ids are checked with the zod GUID shape rule.
export const uuid = z.guid()

// Reviewer identity for a read: the display name only, never the rest of the user record.
export const personName = { select: { fullName: true } } as const
export const displayName = (person: { fullName: string } | null) =>
  person ? person.fullName.slice(0, 200) : null
