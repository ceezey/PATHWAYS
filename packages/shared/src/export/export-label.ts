const manilaParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** The one-line confidentiality notice every exported file carries, in Manila time. */
export const exportLabel = (input: { exportedBy: string; exportedAt: Date }): string => {
  const p = Object.fromEntries(
    manilaParts.formatToParts(input.exportedAt).map((part) => [part.type, part.value]),
  )
  const name = input.exportedBy.replace(/\s+/g, ' ').trim()
  return `Confidential. Exported by ${name} on ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (Asia/Manila).`
}
