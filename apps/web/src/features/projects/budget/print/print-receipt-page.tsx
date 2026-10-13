'use client'

import { useEffect, useState } from 'react'

import { type PrintReceipt, readPrintReceipt, sampleReceipt } from './print-receipt-payload'
import { PrintReceiptView } from './print-receipt-view'

declare global {
  interface Window {
    __PATHWAYS_RECEIPT__?: unknown
  }
}

// The API injects the authorized snapshot before navigation; nothing is fetched here.
export function PrintReceiptPage() {
  const [receipt, setReceipt] = useState<PrintReceipt | null | undefined>(undefined)
  useEffect(() => {
    const sample =
      process.env.NODE_ENV !== 'production'
        ? new URLSearchParams(window.location.search).get('sample')
        : null
    setReceipt(sample === null ? readPrintReceipt(window.__PATHWAYS_RECEIPT__) : sampleReceipt)
  }, [])
  if (receipt === undefined) return null
  return <PrintReceiptView receipt={receipt} />
}
