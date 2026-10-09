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
