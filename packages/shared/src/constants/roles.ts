import { AppRole } from '../enums/app-role'

export const APP_ROLES = [
  AppRole.SYSTEM_ADMINISTRATOR,
  AppRole.PROGRAM_MANAGER,
  AppRole.GRANT_MANAGER,
  AppRole.PROJECT_MANAGER,
  AppRole.MONITORING_AND_EVALUATION_OFFICER,
  AppRole.PROJECT_OFFICER,
] as const
