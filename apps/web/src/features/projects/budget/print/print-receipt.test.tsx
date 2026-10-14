/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/pathways/brand-mark', () => ({ BrandMark: () => null }))

import { amountInWords } from './print-receipt-amount'
import { readPrintReceipt, sampleReceipt } from './print-receipt-payload'
import { PrintReceiptView } from './print-receipt-view'

afterEach(cleanup)

describe('amountInWords', () => {
  it.each([
    ['0.00', 'Zero pesos only'],
    ['1.00', 'One peso only'],
    ['96000.00', 'Ninety-six thousand pesos only'],
    ['1234.56', 'One thousand two hundred thirty-four pesos and fifty-six centavos only'],
    ['1000000.00', 'One million pesos only'],
  ])('writes %s as %s', (amount, words) => {
    expect(amountInWords(amount)).toBe(words)
  })

  it('refuses a value it cannot write instead of guessing', () => {
    expect(amountInWords('not-a-number')).toBe('Not available')
    expect(amountInWords('-5')).toBe('Not available')
  })
})

describe('PrintReceiptView', () => {
  it('marks the page ready and states the amount in figures and words', () => {
    render(<PrintReceiptView receipt={sampleReceipt} />)
    expect(screen.getByRole('main').getAttribute('data-report-ready')).toBe('true')
    expect(screen.getAllByText('₱96,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Ninety-six thousand pesos only')).toBeTruthy()
  })

  it('connects the expense to its activity, budget line and attached proof', () => {
    render(<PrintReceiptView receipt={sampleReceipt} />)
    expect(screen.getAllByText('SSG-05 - School supply distribution, Borongan').length).toBe(2)
    expect(screen.getAllByText('Activity budget').length).toBe(2)
    expect(screen.getByText('supplier-invoice-150-bags.pdf')).toBeTruthy()
  })

  it('names each reviewer and says so when a step has not happened', () => {
    render(<PrintReceiptView receipt={sampleReceipt} />)
    expect(screen.getByText('Ron Perez')).toBeTruthy()
    expect(screen.getByText('Jan Pascual')).toBeTruthy()
    expect(screen.getByText('Not yet')).toBeTruthy()
  })

  it('says it is an internal record, not a BIR official receipt', () => {
    render(<PrintReceiptView receipt={sampleReceipt} />)
    expect(screen.getByText(/not a BIR official receipt/)).toBeTruthy()
  })

  it('renders an empty state rather than a blank page without a payload', () => {
    render(<PrintReceiptView receipt={null} />)
    expect(screen.getByRole('main').getAttribute('data-report-ready')).toBe('empty')
  })
})

describe('readPrintReceipt', () => {
  it('accepts the snapshot the renderer injects and rejects anything else', () => {
    expect(readPrintReceipt(sampleReceipt)).toEqual(sampleReceipt)
    expect(readPrintReceipt({ ...sampleReceipt, extra: true })).toBeNull()
    expect(readPrintReceipt(undefined)).toBeNull()
  })
})
