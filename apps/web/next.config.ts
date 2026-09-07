import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

export const getWebBuildDirectory = (phase: string) =>
  phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'

export const sensitiveIncomingRequestPaths = [/\/auth\/recovery\/callback/]
export const passwordRecoveryResponseHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
]

export default function createNextConfig(phase: string): NextConfig {
  return {
    // Next 15 does not yet provide isolatedDevBuild. Keep development output
    // separate so a validation build cannot invalidate the running UI assets.
    distDir: getWebBuildDirectory(phase),
    // Preserve approved loopback redirects: Next's response adapter otherwise
    // rewrites 127.0.0.1 to localhost after our middleware has returned.
    skipMiddlewareUrlNormalize: true,
    // Recovery callbacks contain short-lived credentials in their query string.
    // Keep those URLs out of the local Next.js incoming-request log.
    logging: {
      incomingRequests: {
        ignore: sensitiveIncomingRequestPaths,
      },
    },
    transpilePackages: [
      '@pathways/config',
      '@pathways/imports',
      '@pathways/shared',
      '@pathways/ui',
    ],
    async headers() {
      return ['/staff/forgot-password', '/auth/update-password', '/auth/recovery/:path*'].map(
        (source) => ({ source, headers: passwordRecoveryResponseHeaders }),
      )
    },
    async redirects() {
      return [
        {
          source: '/login',
          destination: '/staff/login',
          permanent: false,
        },
        {
          source: '/participants',
          destination: '/beneficiaries',
          permanent: false,
        },
        {
          source: '/imports',
          destination: '/collection/import',
          permanent: false,
        },
      ]
    },
  }
}
