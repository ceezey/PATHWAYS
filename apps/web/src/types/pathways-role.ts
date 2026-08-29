export const pathwaysRoles = [
  'Program Manager',
  'Grant Manager',
  'Project Manager',
  'Monitoring and Evaluation Officer',
  'Project Officer',
  'System Administrator',
] as const

export type PathwaysRole = (typeof pathwaysRoles)[number]

export const pathwaysRoleDisplayNames: Record<PathwaysRole, string> = {
  'Program Manager': 'Program Manager',
  'Grant Manager': 'Grant Manager',
  'Project Manager': 'Project Manager',
  'Monitoring and Evaluation Officer': 'Monitoring and Evaluation Officer',
  'Project Officer': 'Project Officer',
  'System Administrator': 'System Administrator',
}

export const getPathwaysRoleDisplayName = (role: PathwaysRole) => pathwaysRoleDisplayNames[role]

export const isPathwaysRole = (value: unknown): value is PathwaysRole =>
  typeof value === 'string' && (pathwaysRoles as readonly string[]).includes(value)
