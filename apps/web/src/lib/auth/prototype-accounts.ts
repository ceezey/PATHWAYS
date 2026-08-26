import type { PrototypeRole } from '@/types/prototype-role'

export interface PrototypeAccount {
  id: string
  displayName: string
  role: PrototypeRole
  username: string
  email: string
}

export type PrototypeAccountPublic = PrototypeAccount

export const publicPrototypeAccounts: PrototypeAccountPublic[] = [
  {
    id: 'program-manager',
    displayName: 'Program Manager Demo',
    role: 'Program Manager',
    username: 'program.manager',
    email: 'program.manager@demo.pathways.local',
  },
  {
    id: 'grant-manager',
    displayName: 'Grant Manager Demo',
    role: 'Grant Manager',
    username: 'grant.manager',
    email: 'grant.manager@demo.pathways.local',
  },
  {
    id: 'project-manager',
    displayName: 'Project Manager Demo',
    role: 'Project Manager',
    username: 'project.manager',
    email: 'project.manager@demo.pathways.local',
  },
  {
    id: 'monitoring-evaluation-officer',
    displayName: 'Monitoring Officer Demo',
    role: 'Monitoring and Evaluation Officer',
    username: 'monitoring.officer',
    email: 'monitoring.officer@demo.pathways.local',
  },
  {
    id: 'project-officer',
    displayName: 'Project Officer Demo',
    role: 'Project Officer',
    username: 'project.officer',
    email: 'project.officer@demo.pathways.local',
  },
  {
    id: 'system-administrator',
    displayName: 'System Administrator Demo',
    role: 'System Administrator',
    username: 'system.admin',
    email: 'system.admin@demo.pathways.local',
  },
]
