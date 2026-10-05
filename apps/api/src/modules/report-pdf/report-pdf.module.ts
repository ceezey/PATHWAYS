import { Module } from '@nestjs/common'
import { ReportPdfRenderer } from './report-pdf.renderer'

@Module({ providers: [ReportPdfRenderer], exports: [ReportPdfRenderer] })
export class ReportPdfModule {}
