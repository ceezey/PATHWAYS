import path from 'node:path'

import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

import { splitSites } from './src/lib/site-split'

export const getWebBuildDirectory = (phase: string) =>
  phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'

export const sensitiveIncomingRequestPaths = [
  /\/auth\/recovery\/callback/,
  /^\/(?:auth|staff|api\/access)(?:\/|\?|$)/,
  /^\/(?:workspace|dashboard|projects|beneficiaries|collection|analytics|alerts|recommendations|reports|settings|participants|imports|unauthorized)(?:\/|\?|$)/,
]
export const passwordRecoveryResponseHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
]

export const privateAuthSurfacePaths = [
  '/staff/login',
  '/staff/forgot-password',
  '/auth/update-password',
  '/auth/mfa',
  '/auth/access-unavailable',
  '/auth/recovery/:path*',
]

// The public hostname when the address split is on, else ''.
export const publicSiteHostname = (env: Record<string, string | undefined>) =>
  splitSites(env.NEXT_PUBLIC_PUBLIC_SITE_BASE_URL, env.NEXT_PUBLIC_STAFF_PORTAL_BASE_URL)?.public
    .hostname ?? ''

export default function createNextConfig(phase: string): NextConfig {
  const publicHost = publicSiteHostname(process.env)
  // Staff redirects and headers run before middleware, so they must skip the public address.
  // Next drops the port and case of the Host but not a trailing dot, so the pattern allows one.
  const missing = [{ type: 'host' as const, value: `${publicHost.replaceAll('.', '\\.')}\\.?` }]
  const staffOnly = <T extends object>(rules: T[]) =>
    publicHost ? rules.map((rule) => ({ ...rule, missing })) : rules
  return {
    // Next 15 does not yet provide isolatedDevBuild. Keep development output
    // separate so a validation build cannot invalidate the running UI assets.
    distDir: getWebBuildDirectory(phase),
    // The monorepo root holds the lockfile; pinning it stops Turbopack guessing in nested worktrees.
    turbopack: { root: path.resolve(process.cwd(), '../..') },
    // Preserve approved loopback redirects: Next's response adapter otherwise
    // rewrites 127.0.0.1 to localhost after our middleware has returned.
    skipMiddlewareUrlNormalize: true,
    // Authentication URLs can contain credentials, including unexpected query
    // fields. Internal routes can contain identifiers. Omit their request URLs.
    logging: {
      incomingRequests: {
        ignore: sensitiveIncomingRequestPaths,
      },
    },
    // Barrel imports of an indexed feature otherwise pull every client component of it into the route bundle.
    experimental: {
      optimizePackageImports: [
        '@/features/auth',
        '@/features/profile',
        '@/features/public',
        '@/features/settings',
        '@/features/analytics',
        '@/features/dashboard',
        '@/features/projects',
        '@/features/beneficiaries',
        '@/features/reports',
        '@/features/collection',
        '@/features/rules',
      ],
    },
    transpilePackages: ['@pathways/config', '@pathways/imports', '@pathways/shared'],
    async headers() {
      return staffOnly(
        privateAuthSurfacePaths.map((source) => ({
          source,
          headers: passwordRecoveryResponseHeaders,
        })),
      )
    },
    async redirects() {
      return staffOnly([
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
        // Retired V4-C11 route; redirecting here runs before the middleware route check.
        {
          source: '/collection/entry',
          destination: '/collection',
          permanent: true,
        },
      ])
    },
  }
}
