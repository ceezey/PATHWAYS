import { Injectable } from '@nestjs/common'
import { developerApplicationAccessEnabled } from './developer-access'

@Injectable()
export class AuthService {
  getStatus() {
    return {
      provider: 'supabase-auth',
      jwtVerificationEnabled: true,
      mfaRequired: true,
      authorizationSource: 'pathways-database',
      developerWorkspaceEnabled: developerApplicationAccessEnabled(),
      businessWritesEnabled: false,
    }
  }
}
