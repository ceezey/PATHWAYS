import { AppRole } from '../enums/app-role'

export const APP_ROLES = [
  AppRole.ADMIN,
  AppRole.M_AND_E_STAFF,
  AppRole.PROJECT_OFFICER,
  AppRole.PROJECT_MANAGER,
  AppRole.PROGRAM_MANAGER,
] as const
