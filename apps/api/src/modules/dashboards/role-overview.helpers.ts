/** Rows every role overview list shows. */
export const rows = 5

/** Calendar day of a date, or null. */
export const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)
