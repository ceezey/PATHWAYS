export const prototypeRoles = [
  'Program Manager',
  'Project Manager',
  'Monitoring and Evaluation Officer',
  'Project Officer',
  'System Administrator',
] as const

export type PrototypeRole = (typeof prototypeRoles)[number]

export const defaultPrototypeRole: PrototypeRole = 'Program Manager'
