import type { Beneficiary } from '@/types/pathways'

export const mockBeneficiaries: Beneficiary[] = [
  {
    id: 'ben-001',
    code: 'BEN-NCR-001',
    displayName: 'Beneficiary NCR-001',
    projectIds: ['futuremakers-ncr'],
    location: 'Quezon City',
    sex: 'Female',
    ageGroup: '18-24',
    disabilityStatus: 'Without disability',
    enrollmentStatus: 'Active',
  },
  {
    id: 'ben-002',
    code: 'BEN-WS-014',
    displayName: 'Beneficiary WS-014',
    projectIds: ['youth-rise-western-samar'],
    location: 'Calbayog',
    sex: 'Male',
    ageGroup: '15-17',
    disabilityStatus: 'Not disclosed',
    enrollmentStatus: 'Pending Review',
  },
  {
    id: 'ben-003',
    code: 'BEN-NAV-022',
    displayName: 'Beneficiary NAV-022',
    projectIds: ['grassroots-centers-navotas'],
    location: 'Navotas',
    sex: 'Female',
    ageGroup: '25+',
    disabilityStatus: 'With disability',
    enrollmentStatus: 'Active',
  },
]
