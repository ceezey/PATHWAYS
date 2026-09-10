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
    displayName: 'Maria Santos',
    role: 'Program Manager',
    username: 'program.manager',
    email: 'program.manager@pathways.example',
  },
  {
    id: 'grant-manager',
    displayName: 'Elena Reyes',
    role: 'Grant Manager',
    username: 'grant.manager',
    email: 'grant.manager@pathways.example',
  },
  {
    id: 'project-manager',
    displayName: 'Carlo Mendoza',
    role: 'Project Manager',
    username: 'project.manager',
    email: 'project.manager@pathways.example',
  },
  {
    id: 'monitoring-evaluation-officer',
    displayName: 'Ana Villanueva',
    role: 'Monitoring and Evaluation Officer',
    username: 'monitoring.officer',
    email: 'monitoring.officer@pathways.example',
  },
  {
    id: 'project-officer',
    displayName: 'Paolo Cruz',
    role: 'Project Officer',
    username: 'project.officer',
    email: 'project.officer@pathways.example',
  },
  {
    id: 'system-administrator',
    displayName: 'Gabriel Flores',
    role: 'System Administrator',
    username: 'system.admin',
    email: 'system.admin@pathways.example',
  },
]
