import type { NextRequest } from 'next/server'

import { updateSession } from './lib/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/workspace',
    '/auth/mfa',
    '/dashboard/:path*',
    '/projects/:path*',
    '/beneficiaries/:path*',
    '/collection/:path*',
    '/analytics/:path*',
    '/alerts/:path*',
    '/recommendations/:path*',
    '/imports/:path*',
    '/participants/:path*',
    '/reports/:path*',
    '/settings/:path*',
    '/unauthorized',
  ],
}
