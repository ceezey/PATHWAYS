export const defaultPrototypeLabels = {
  moduleDashboard: 'Dashboard',
  moduleProjects: 'Project Information Management',
  moduleBeneficiaries: 'Beneficiary Journey Tracking',
  moduleCollection: 'Metadata-Driven Data Integration',
  moduleAnalytics: 'Data Analysis',
  moduleAlerts: 'Rule-Based Alerts',
  moduleRecommendations: 'Human-reviewed recommendation',
  moduleReports: 'Reports',
  moduleAlertsRepository: 'Alerts Repository',
  moduleUserManagement: 'User Management',
  moduleLabelSettings: 'Edit Labels',
  projectWorkspace: 'Project Workspace',
  projectActivities: 'Project Activities',
  projectEvidence: 'Evidence & Reports',
  projectIndicators: 'Target Indicators',
  projectMonitorEvaluate: 'Monitoring & Evaluation',
  projectBudget: 'Budget',
  projectJourneyStages: 'Journey Stages',
  projectPublicDashboard: 'Public Project Dashboard',
} as const

export type PrototypeLabelKey = keyof typeof defaultPrototypeLabels
export type PrototypeLabels = { [Key in PrototypeLabelKey]: string }

export interface PrototypeLabelDefinition {
  key: PrototypeLabelKey
  label: string
  helperText: string
}

export interface PrototypeLabelGroup {
  id: string
  title: string
  description: string
  labels: PrototypeLabelDefinition[]
}

export const prototypeLabelGroups: PrototypeLabelGroup[] = [
  {
    id: 'workspace-page-headings',
    title: 'Workspace page headings',
    description: 'Visible headings inside the requested workspace pages.',
    labels: [
      {
        key: 'moduleProjects',
        label: 'Projects page heading',
        helperText: 'Heading for the Project Information Management directory.',
      },
      {
        key: 'moduleBeneficiaries',
        label: 'Beneficiaries page heading',
        helperText: 'Heading for the Beneficiary Journey Tracking directory.',
      },
    ],
  },
  {
    id: 'decision-support-page-headings',
    title: 'Decision Support page headings',
    description: 'Visible headings inside the requested decision-support pages.',
    labels: [
      {
        key: 'moduleAnalytics',
        label: 'Analytics page heading',
        helperText: 'Heading for the Analytics workspace.',
      },
      {
        key: 'moduleAlerts',
        label: 'Alerts page heading',
        helperText: 'Heading for Rule-Based Alerts.',
      },
      {
        key: 'moduleRecommendations',
        label: 'Recommendations page heading',
        helperText: 'Heading for Human-reviewed recommendation outcomes.',
      },
      {
        key: 'moduleReports',
        label: 'Reports page heading',
        helperText: 'Heading for internal reporting pages.',
      },
      {
        key: 'moduleAlertsRepository',
        label: 'Alerts Repository page heading',
        helperText: 'Heading for predefined alert and recommendation rules.',
      },
    ],
  },
  {
    id: 'administration-page-headings',
    title: 'Administration page headings',
    description: 'Visible headings inside the two Administration pages.',
    labels: [
      {
        key: 'moduleUserManagement',
        label: 'User Management page heading',
        helperText: 'Heading for prototype user and role records.',
      },
      {
        key: 'moduleLabelSettings',
        label: 'Edit Labels page heading',
        helperText: 'Heading for this browser-local page-heading editor.',
      },
    ],
  },
]

const editableLabelKeys = prototypeLabelGroups.flatMap((group) =>
  group.labels.map((definition) => definition.key),
)

export const mergePrototypeLabels = (value: unknown): PrototypeLabels => {
  const labels: PrototypeLabels = { ...defaultPrototypeLabels }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return labels
  }

  const candidate = value as Record<string, unknown>

  for (const key of editableLabelKeys) {
    const nextValue = candidate[key]

    if (typeof nextValue === 'string' && nextValue.trim()) {
      labels[key] = nextValue.trim().slice(0, 64)
    }
  }

  return labels
}
