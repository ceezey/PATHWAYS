/** Makes every line ending a line feed, because Papa Parse picks one ending from the start of a file. */
export const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, '\n')
