import type { AnalyticsLocationRecord } from '@/types/pathways'

// Aggregate city-level prototype data only. Coordinates are approximate city centroids and do not
// represent Beneficiary homes, activity venues, or service-provider addresses.
export const mockAnalyticsLocations: AnalyticsLocationRecord[] = [
  {
    id: 'quezon-city',
    name: 'Quezon City',
    region: 'National Capital Region',
    latitude: 14.676,
    longitude: 121.044,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'futuremakers-ncr',
        beneficiariesReached: 386,
        deliverySites: 4,
        activitiesDelivered: 7,
        coverageStatus: 'Strong',
      },
    ],
  },
  {
    id: 'manila',
    name: 'Manila',
    region: 'National Capital Region',
    latitude: 14.6,
    longitude: 120.984,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'futuremakers-ncr',
        beneficiariesReached: 274,
        deliverySites: 3,
        activitiesDelivered: 5,
        coverageStatus: 'Growing',
      },
    ],
  },
  {
    id: 'navotas',
    name: 'Navotas',
    region: 'National Capital Region',
    latitude: 14.666,
    longitude: 120.94,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'futuremakers-ncr',
        beneficiariesReached: 182,
        deliverySites: 2,
        activitiesDelivered: 3,
        coverageStatus: 'Growing',
      },
      {
        projectId: 'grassroots-centers-navotas',
        beneficiariesReached: 516,
        deliverySites: 5,
        activitiesDelivered: 8,
        coverageStatus: 'Strong',
      },
    ],
  },
  {
    id: 'calbayog',
    name: 'Calbayog',
    region: 'Western Samar',
    latitude: 12.067,
    longitude: 124.596,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'youth-rise-western-samar',
        beneficiariesReached: 168,
        deliverySites: 3,
        activitiesDelivered: 2,
        coverageStatus: 'Growing',
      },
    ],
  },
  {
    id: 'catbalogan',
    name: 'Catbalogan',
    region: 'Western Samar',
    latitude: 11.776,
    longitude: 124.886,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'youth-rise-western-samar',
        beneficiariesReached: 142,
        deliverySites: 2,
        activitiesDelivered: 1,
        coverageStatus: 'Limited',
      },
    ],
  },
  {
    id: 'basey',
    name: 'Basey',
    region: 'Western Samar',
    latitude: 11.282,
    longitude: 125.069,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'youth-rise-western-samar',
        beneficiariesReached: 81,
        deliverySites: 1,
        activitiesDelivered: 0,
        coverageStatus: 'Limited',
      },
    ],
  },
  {
    id: 'catarman',
    name: 'Catarman',
    region: 'Northern Samar',
    latitude: 12.499,
    longitude: 124.638,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'safe-spaces-northern-samar',
        beneficiariesReached: 174,
        deliverySites: 2,
        activitiesDelivered: 2,
        coverageStatus: 'Limited',
      },
    ],
  },
  {
    id: 'laoang',
    name: 'Laoang',
    region: 'Northern Samar',
    latitude: 12.57,
    longitude: 125.014,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'safe-spaces-northern-samar',
        beneficiariesReached: 110,
        deliverySites: 1,
        activitiesDelivered: 1,
        coverageStatus: 'Limited',
      },
    ],
  },
  {
    id: 'mandaluyong',
    name: 'Mandaluyong',
    region: 'National Capital Region',
    latitude: 14.579,
    longitude: 121.036,
    coordinatePrecision: 'Approximate city centroid',
    projectSummaries: [
      {
        projectId: 'girls-lead-metro-manila',
        beneficiariesReached: 0,
        deliverySites: 0,
        activitiesDelivered: 0,
        coverageStatus: 'Planned',
      },
    ],
  },
]
