import type { AlertRecord } from '@/types/pathways'

export const mockAlerts: AlertRecord[] = [
  {
    id: 'alert-yr-site-delay',
    projectId: 'youth-rise-western-samar',
    severity: 'Warning',
    category: 'Activity',
    title: 'Training site validation is behind schedule',
  },
  {
    id: 'alert-ss-budget',
    projectId: 'safe-spaces-northern-samar',
    severity: 'Critical',
    category: 'Budget',
    title: 'Budget utilization requires human review',
  },
  {
    id: 'alert-fm-bootcamp',
    projectId: 'futuremakers-ncr',
    severity: 'Information',
    category: 'Indicator',
    title: 'Bootcamp completion is ready for checkpoint review',
  },
]
