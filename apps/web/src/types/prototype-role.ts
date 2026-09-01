export const prototypeRoles = [
  'Program Manager',
  'Grant Manager',
  'Project Manager',
  'Monitoring and Evaluation Officer',
  'Project Officer',
  'System Administrator',
] as const

export type PrototypeRole = (typeof prototypeRoles)[number]

export const defaultPrototypeRole: PrototypeRole = 'Program Manager'

export const prototypeRoleDisplayNames: Record<PrototypeRole, string> = {
  'Program Manager': 'Program Manager',
  'Grant Manager': 'Grant Manager',
  'Project Manager': 'Project Manager',
  'Monitoring and Evaluation Officer': 'Monitoring and Evaluation Officer',
  'Project Officer': 'Project Officer',
  'System Administrator': 'System Administrator',
}

export const getPrototypeRoleDisplayName = (role: PrototypeRole) => prototypeRoleDisplayNames[role]

export const isPrototypeRole = (value: unknown): value is PrototypeRole =>
  typeof value === 'string' && (prototypeRoles as readonly string[]).includes(value)
