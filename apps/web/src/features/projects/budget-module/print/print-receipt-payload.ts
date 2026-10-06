import { z } from 'zod'

const text = (max: number) => z.string().max(max)
const person = z.object({ name: text(200).nullable(), at: text(40).nullable() }).strict()

const printReceiptSchema = z
  .object({
    receiptNo: text(40),
    issuedAt: text(40),
    organization: text(200),
    project: z.object({ code: text(40).nullable(), title: text(200) }).strict(),
    activity: z
      .object({ code: text(40).nullable(), title: text(200) })
      .strict()
      .nullable(),
    budgetLine: text(120),
    allocated: text(40).nullable(),
    expense: z
      .object({
        description: text(500),
        amount: text(40),
        currency: text(8),
        date: text(40),
        status: text(40),
      })
      .strict(),
    people: z
      .object({ submitted: person, verified: person, approved: person, signedOff: person })
      .strict(),
    attachment: z
      .object({ fileName: text(260), sha256: text(64), byteSize: text(40) })
      .strict()
      .nullable(),
  })
  .strict()

export type PrintReceipt = z.infer<typeof printReceiptSchema>

export const readPrintReceipt = (input: unknown): PrintReceipt | null => {
  const parsed = printReceiptSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}

// Fictional fixture for checking the receipt design locally with ?sample=1.
export const sampleReceipt: PrintReceipt = {
  receiptNo: 'DR-2026-0001',
  issuedAt: '2026-10-06T01:00:00.000Z',
  organization: 'Plan International Pilipinas',
  project: { code: 'SSG', title: 'Safe Schools for Girls - Eastern Samar' },
  activity: { code: 'SSG-05', title: 'School supply distribution, Borongan' },
  budgetLine: 'Activity budget',
  allocated: '96000.00',
  expense: {
    description: 'Partial payment to supplier for 150 school bags',
    amount: '96000.00',
    currency: 'PHP',
    date: '2026-09-20',
    status: 'APPROVED',
  },
  people: {
    submitted: { name: 'Ron Perez', at: '2026-09-20T02:00:00.000Z' },
    verified: { name: 'Leah Sy', at: '2026-09-21T02:00:00.000Z' },
    approved: { name: 'Jan Pascual', at: '2026-09-22T02:00:00.000Z' },
    signedOff: { name: null, at: null },
  },
  attachment: {
    fileName: 'supplier-invoice-150-bags.pdf',
    sha256: '9f2c1a77b4e05d3c8a61f0b2d4e7c9a1538b06d2f4a7c9e1b3d5f70924a6c8e0',
    byteSize: '184320',
  },
}
