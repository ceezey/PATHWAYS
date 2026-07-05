import type { PrototypeRole } from '@/types/prototype-role'

export interface PrototypeAccount {
  id: string
  displayName: string
  role: PrototypeRole
  username: string
  email: string
  password: string
}

export type PrototypeAccountPublic = Omit<PrototypeAccount, 'password'>

export const prototypeAccounts: PrototypeAccount[] = [
  {
    id: 'program-manager',
    displayName: 'Program Manager Demo',
    role: 'Program Manager',
    username: 'program.manager',
    email: 'program.manager@demo.pathways.local',
    password: 'PathwaysDemo!2026',
  },
  {
    id: 'project-manager',
    displayName: 'Project Manager Demo',
    role: 'Project Manager',
    username: 'project.manager',
    email: 'project.manager@demo.pathways.local',
    password: 'PathwaysDemo!2026',
  },
  {
    id: 'monitoring-evaluation-officer',
    displayName: 'Monitoring Officer Demo',
    role: 'Monitoring and Evaluation Officer',
    username: 'monitoring.officer',
    email: 'monitoring.officer@demo.pathways.local',
    password: 'PathwaysDemo!2026',
  },
  {
    id: 'project-officer',
    displayName: 'Project Officer Demo',
    role: 'Project Officer',
    username: 'project.officer',
    email: 'project.officer@demo.pathways.local',
    password: 'PathwaysDemo!2026',
  },
  {
    id: 'system-administrator',
    displayName: 'System Administrator Demo',
    role: 'System Administrator',
    username: 'system.admin',
    email: 'system.admin@demo.pathways.local',
    password: 'PathwaysDemo!2026',
  },
]

export const publicPrototypeAccounts = prototypeAccounts.map(
  ({ password: _password, ...account }) => account,
)

export const validatePrototypeCredentials = (identifier: string, password: string) => {
  const normalizedIdentifier = identifier.trim().toLowerCase()
  const account = prototypeAccounts.find(
    (item) =>
      item.email.toLowerCase() === normalizedIdentifier ||
      item.username.toLowerCase() === normalizedIdentifier,
  )

  if (!account || account.password !== password) {
    return null
  }

  const { password: _password, ...safeAccount } = account
  return safeAccount
}
