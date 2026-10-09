import type { RoleName } from '@pathways/shared'

// Role names in UI display order, System Administrator last; codes live in the shared role catalog.
export const pathwaysRoles = [
  'Program Manager',
  'Grant Manager',
  'Project Manager',
  'Monitoring and Evaluation Officer',
  'Project Officer',
  'System Administrator',
] as const satisfies readonly RoleName[]

export type PathwaysRole = RoleName
