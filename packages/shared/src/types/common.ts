export interface NavItem {
  href: string
  label: string
  description: string
}

export interface HealthStatus {
  status: 'ok'
  service: string
  timestamp: string
  version: string
}

export interface ImportSummary {
  fileName: string
  fileType: 'csv' | 'xlsx' | 'xls'
  totalRows: number
  totalColumns: number
  headers: string[]
  warnings: string[]
}
