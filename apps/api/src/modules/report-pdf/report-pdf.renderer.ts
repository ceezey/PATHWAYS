import { Inject, Injectable } from '@nestjs/common'
import { REPORT_MAX_BYTES, validatedReportRows } from '../reports/report-artifact'
import type { ProjectSections } from '../reports/report-project-status'
import { PrintPdfError, PrintPdfRenderer, type PrintPdfStage } from './print-pdf.renderer'

export type PrintSnapshot = {
  title: string
  kind: string
  columns: string[]
  rows: string[][]
  sections?: ProjectSections
  generatedAt: string
  unavailableReasons: string[]
}
const reportIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ReportPdfStage = PrintPdfStage

/** Every render failure carries a fixed message, the failing stage and the original error name only. */
export class ReportPdfError extends Error {
  constructor(
    readonly stage: ReportPdfStage,
    readonly causeName = 'Error',
  ) {
    super(`Designed PDF failed at ${stage}.`)
    this.name = 'ReportPdfError'
  }
}

@Injectable()
export class ReportPdfRenderer {
  constructor(@Inject(PrintPdfRenderer) private readonly print: PrintPdfRenderer) {}

  async render(reportId: string, snapshot: PrintSnapshot): Promise<Buffer> {
    if (!reportIdPattern.test(reportId)) throw new ReportPdfError('input')
    try {
      validatedReportRows([snapshot.columns, ...snapshot.rows])
    } catch (error) {
      throw new ReportPdfError('input', error instanceof Error ? error.name : undefined)
    }
    try {
      return await this.print.render({
        path: `/print/reports/${reportId.toLowerCase()}`,
        globalName: '__PATHWAYS_REPORT__',
        payload: snapshot,
        maxBytes: REPORT_MAX_BYTES,
      })
    } catch (error) {
      if (error instanceof PrintPdfError) throw new ReportPdfError(error.stage, error.causeName)
      throw new ReportPdfError('print', error instanceof Error ? error.name : undefined)
    }
  }
}
