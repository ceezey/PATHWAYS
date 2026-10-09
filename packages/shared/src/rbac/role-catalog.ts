// The six canonical role codes and their display names, the one role catalog for api and web.
export const roleNames = {
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  PROGRAM_MANAGER: 'Program Manager',
  GRANT_MANAGER: 'Grant Manager',
  PROJECT_MANAGER: 'Project Manager',
  MONITORING_AND_EVALUATION_OFFICER: 'Monitoring and Evaluation Officer',
  PROJECT_OFFICER: 'Project Officer',
} as const
export type CanonicalRole = keyof typeof roleNames
export type RoleName = (typeof roleNames)[CanonicalRole]

// Display name to role code, the inverse of roleNames.
export const roleCodeByName = Object.fromEntries(
  Object.entries(roleNames).map(([code, name]) => [name, code]),
) as Record<RoleName, CanonicalRole>

export function isCanonicalRole(role: string): role is CanonicalRole {
  return Object.hasOwn(roleNames, role)
}

// Role code for an untrusted display name, or undefined when the name is not a catalog role.
export function roleCodeFor(name: string): CanonicalRole | undefined {
  return Object.hasOwn(roleCodeByName, name) ? roleCodeByName[name as RoleName] : undefined
}
