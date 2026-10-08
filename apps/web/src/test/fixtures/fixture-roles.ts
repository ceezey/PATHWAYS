export const prototypeRoles = [
  'Program Manager',
  'Grant Manager',
  'Project Manager',
  'Monitoring and Evaluation Officer',
  'Project Officer',
  'System Administrator',
] as const

export type PrototypeRole = (typeof prototypeRoles)[number]
