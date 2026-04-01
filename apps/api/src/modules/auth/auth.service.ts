import { Injectable } from '@nestjs/common'

import { readApiEnv } from '@pathways/config'

@Injectable()
export class AuthService {
  getStatus() {
    const env = readApiEnv(process.env)

    return {
      provider: 'supabase-auth',
      jwtVerificationEnabled: Boolean(env.SUPABASE_JWT_SECRET),
      callbackPlaceholder: '/auth/callback',
      note: 'Replace the placeholder guard behavior with real JWT verification once Supabase setup is complete.',
    }
  }
}
