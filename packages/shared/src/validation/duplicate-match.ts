// Error code of the 409 answer when a create matches an existing record.
export const POSSIBLE_DUPLICATE = 'POSSIBLE_DUPLICATE' as const

// Comparison key for duplicate warnings: trimmed, case-insensitive text.
export const duplicateNameKey = (value: string | null | undefined): string =>
  (value ?? '').trim().toLocaleLowerCase()
