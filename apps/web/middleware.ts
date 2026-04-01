import type { NextRequest } from 'next/server'

import { updateSession } from './src/lib/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/imports/:path*',
    '/participants/:path*',
    '/reports/:path*',
    '/settings/:path*',
  ],
}
