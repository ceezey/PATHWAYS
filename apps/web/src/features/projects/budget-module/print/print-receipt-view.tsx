'use client'

import { BrandMark } from '@/components/pathways/brand-mark'
import { Band, Table, td } from '@/features/reports/print/print-report-sections'

import { amountInWords } from './print-receipt-amount'
import type { PrintReceipt } from './print-receipt-payload'

const manila = (value: string | null, withTime = false) => {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  })
}

const peso = (amount: string, currency: string) => {
  const parsed = Number(amount)
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(parsed)
    : amount
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </dt>
    <dd className="mt-0.5 text-xs font-medium text-ink">{value}</dd>
  </div>
)

const Signature = ({
  step,
  name,
  at,
}: { step: string; name: string | null; at: string | null }) => (
  <div className="print-avoid border border-border p-3">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {step}
    </p>
    <p className="mt-6 border-t border-ink pt-1 text-xs font-medium text-ink">
      {name ?? 'Not yet'}
    </p>
    <p className="text-[10px] text-muted-foreground">{at ? manila(at) : 'No date recorded'}</p>
  </div>
)

export function PrintReceiptView({ receipt }: { receipt: PrintReceipt | null }) {
  if (!receipt)
    return (
      <main data-report-ready="empty" className="p-8 text-sm text-muted-foreground">
        No receipt data.
      </main>
    )
  const { expense } = receipt
  const activity = receipt.activity
    ? `${receipt.activity.code ? `${receipt.activity.code} - ` : ''}${receipt.activity.title}`
    : 'Project-level budget'
  return (
    <main
      data-report-ready="true"
      className="mx-auto max-w-[180mm] bg-workspace text-ink print:max-w-none"
    >
      <header className="print-avoid flex items-start justify-between gap-3 border-b-4 border-navy pb-4">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" priority />
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy">PATHWAYS</p>
            <h1 className="font-heading text-2xl text-navy">Disbursement Receipt</h1>
            <p className="text-sm text-muted-foreground">{receipt.organization}</p>
          </div>
        </div>
        <dl className="space-y-1 text-right">
          <Fact label="Receipt no." value={receipt.receiptNo} />
          <Fact label="Issued" value={manila(receipt.issuedAt, true)} />
        </dl>
      </header>

      <Band title="Charged to" />
      <dl className="print-avoid grid grid-cols-2 gap-3 border border-t-0 border-border p-3">
        <Fact
          label="Project"
          value={`${receipt.project.code ? `${receipt.project.code} - ` : ''}${receipt.project.title}`}
        />
        <Fact label="Activity" value={activity} />
        <Fact label="Budget line" value={receipt.budgetLine} />
        <Fact
          label="Allocated to this line"
          value={receipt.allocated ? peso(receipt.allocated, expense.currency) : 'Not recorded'}
        />
      </dl>

      <Band title="Particulars" />
      <Table head={['Description', 'Budget line', 'Activity', 'Amount']}>
        <tr className="print-avoid">
          <td className={td}>{expense.description}</td>
          <td className={td}>{receipt.budgetLine}</td>
          <td className={td}>{activity}</td>
          <td className={`${td} text-right tabular-nums`}>
            {peso(expense.amount, expense.currency)}
          </td>
        </tr>
        <tr className="print-avoid font-semibold">
          <td className={td} colSpan={3}>
            Total
          </td>
          <td className={`${td} text-right tabular-nums`}>
            {peso(expense.amount, expense.currency)}
          </td>
        </tr>
      </Table>
      <p className="print-avoid mt-2 border border-t-0 border-border p-3 text-xs">
        <span className="font-semibold">Amount in words: </span>
        {amountInWords(expense.amount)}
      </p>
      <dl className="print-avoid mt-2 grid grid-cols-2 gap-3">
        <Fact label="Expense date" value={manila(expense.date)} />
        <Fact label="Review status" value={expense.status} />
      </dl>

      <Band title="Certification" />
      <div className="print-avoid grid grid-cols-4 gap-2 border border-t-0 border-border p-3">
        <Signature step="Submitted by" {...receipt.people.submitted} />
        <Signature step="Verified by" {...receipt.people.verified} />
        <Signature step="Approved by" {...receipt.people.approved} />
        <Signature step="Signed off by" {...receipt.people.signedOff} />
      </div>

      <Band title="Supporting document" />
      <div className="print-avoid border border-t-0 border-border p-3 text-xs">
        {receipt.attachment ? (
          <dl className="grid grid-cols-3 gap-3">
            <Fact label="File" value={receipt.attachment.fileName} />
            <Fact label="Size" value={`${receipt.attachment.byteSize} bytes`} />
            <Fact label="SHA-256" value={receipt.attachment.sha256} />
          </dl>
        ) : (
          <p className="text-muted-foreground">
            No private receipt is attached to this expense yet.
          </p>
        )}
      </div>

      <p className="print-avoid mt-4 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
        Internal accountability record generated from the PATHWAYS expense ledger. It is not a BIR
        official receipt and is not a demand for payment. The supporting document named above is the
        seller's own receipt or invoice and is held privately with this entry.
      </p>
    </main>
  )
}
