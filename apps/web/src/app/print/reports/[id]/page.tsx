'use client'

import { useEffect, useState } from 'react'

import {
  type PrintReport,
  readPrintReport,
  sampleReport,
} from '@/features/reports/print/print-report-payload'
import { sampleProjectReport } from '@/features/reports/print/print-report-sample'
import { PrintReportView } from '@/features/reports/print/print-report-view'

declare global {
  interface Window {
    __PATHWAYS_REPORT__?: unknown
  }
}

// The API injects the authorized snapshot before navigation; nothing is fetched here.
export default function PrintReportPage() {
  const [report, setReport] = useState<PrintReport | null | undefined>(undefined)
  useEffect(() => {
    const sample =
      process.env.NODE_ENV !== 'production'
        ? new URLSearchParams(window.location.search).get('sample')
        : null
    if (sample === null) setReport(readPrintReport(window.__PATHWAYS_REPORT__))
    else setReport(sample === 'project' ? sampleProjectReport : sampleReport)
  }, [])
  if (report === undefined) return null
  return <PrintReportView report={report} />
}
