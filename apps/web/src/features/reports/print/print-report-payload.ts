import { z } from 'zod'

const cell = z.string().max(2000)
const printReportSchema = z
  .object({
    title: z.string().min(1).max(200),
    kind: z.string().min(1).max(40),
    columns: z.array(cell).min(1).max(30),
    rows: z.array(z.array(cell).max(30)).max(1000),
    generatedAt: z.string().max(40),
    unavailableReasons: z.array(cell).max(100),
  })
  .strict()

export type PrintReport = z.infer<typeof printReportSchema>

export const readPrintReport = (input: unknown): PrintReport | null => {
  const parsed = printReportSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}

// Fictional fixture for checking the print design locally with ?sample=1.
export const sampleReport: PrintReport = {
  title: 'Sample beneficiary summary',
  kind: 'BENEFICIARY_SUMMARY',
  columns: ['Dimension', 'Category', 'Value', 'Metric state', 'Reason'],
  rows: [
    ['Sex', 'Female', '128', 'AVAILABLE', ''],
    ['Sex', 'Male', '97', 'AVAILABLE', ''],
    ['Sex', 'Intersex', 'Suppressed', 'SUPPRESSED', 'Small group'],
    ['Age group', '18 to 24', '61', 'AVAILABLE', ''],
    ['Age group', '25 to 34', '84', 'AVAILABLE', ''],
  ],
  generatedAt: '2026-10-05T03:00:00.000Z',
  unavailableReasons: ['Groups below the small-group threshold are suppressed.'],
}
