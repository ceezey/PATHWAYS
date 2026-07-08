import type { Indicator } from '@/types/pathways'

export const mockIndicators: Indicator[] = [
  {
    id: 'ind-fm-01',
    projectId: 'futuremakers-ncr',
    code: 'FM-ORIENTED',
    label: 'Beneficiaries completing orientation',
    target: 250,
    actual: 250,
  },
  {
    id: 'ind-fm-02',
    projectId: 'futuremakers-ncr',
    code: 'FM-BOOTCAMP',
    label: 'Beneficiaries completing skills bootcamp',
    target: 420,
    actual: 268,
  },
  {
    id: 'ind-yr-01',
    projectId: 'youth-rise-western-samar',
    code: 'YR-SITES',
    label: 'Training sites validated',
    target: 12,
    actual: 5,
  },
  {
    id: 'ind-ss-01',
    projectId: 'safe-spaces-northern-samar',
    code: 'SS-REFERRAL',
    label: 'Referral pathway cases reviewed',
    target: 120,
    actual: 106,
  },
]
