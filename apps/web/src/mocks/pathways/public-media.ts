import type { PublicBeneficiaryMediaRecord } from '@/types/pathways'

export const mockApprovedPublicMedia: PublicBeneficiaryMediaRecord[] = [
  {
    id: 'public-media-futuremakers-workshop',
    projectId: 'futuremakers-ncr',
    mediaType: 'Photo',
    src: '/media/futuremakers-skills-workshop.png',
    alt: 'A group of adult learners taking part in a facilitated skills workshop.',
    caption:
      'A facilitated skills workshop with participants completing guided activities.',
    contextLabel: 'Skills workshop',
    approvalState: 'Approved for public presentation',
    consentScope: 'Public project storytelling',
    source: 'Synthetic mock media',
  },
  {
    id: 'public-media-youth-rise-site',
    projectId: 'youth-rise-western-samar',
    mediaType: 'Photo',
    src: '/media/youth-rise-learning-site.png',
    alt: 'Two adult staff members preparing a community learning site.',
    caption:
      'A community learning site prepared for scheduled activities.',
    contextLabel: 'Learning-site readiness',
    approvalState: 'Approved for public presentation',
    consentScope: 'Public project storytelling',
    source: 'Synthetic mock media',
  },
]
