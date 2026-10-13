/** Download name from the saved report name, stripped of characters file systems reject. */
export const reportFileName = (name: string, reportId: string, extension: string) => {
  const base = Array.from(name, (char) => (char < ' ' || '\\/:*?"<>|'.includes(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 150)
  return `${base || `report-${reportId}`}.${extension}`
}
