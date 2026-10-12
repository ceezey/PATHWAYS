// Counts a word and adds an s unless the count is exactly one.
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
