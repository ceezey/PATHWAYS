import { Injectable } from '@nestjs/common'

@Injectable()
export class AuthService {
  getStatus() {
    return {
      provider: 'supabase-auth',
      jwtVerificationEnabled: true,
      mfaRequired: true,
      authorizationSource: 'pathways-database',
      workspaceAccessEnabled: true,
      businessWritesEnabled: false,
    }
  }
}
