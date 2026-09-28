import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'

const localWebOrigins = ['http://127.0.0.1:3000', 'http://localhost:3000'] as const

export function allowedWebOrigins(configuredOrigin: string) {
  if (!configuredOrigin) return [...localWebOrigins]
  const url = new URL(configuredOrigin)
  if (
    url.origin !== configuredOrigin ||
    url.protocol !== 'https:' ||
    url.hostname.includes('*') ||
    url.username ||
    url.password
  ) {
    throw new Error('WEB_ORIGIN must be an HTTPS origin.')
  }
  return [...localWebOrigins, configuredOrigin]
}

// Practical browser cap for caching a CORS preflight (OPTIONS) response.
// Chromium and Firefox both clamp Access-Control-Max-Age to 86400s even if a
// server sends a larger value; Safari caps lower but still benefits from a
// large value here. This does not change which origins/methods/headers are
// allowed -- only how long the browser may skip re-issuing the preflight.
export const CORS_PREFLIGHT_MAX_AGE_SECONDS = 86400

export function corsOptions(webOrigin: string): CorsOptions {
  return {
    origin: allowedWebOrigins(webOrigin),
    credentials: false,
    maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
    exposedHeaders: ['Content-Disposition', 'X-Content-Type-Options'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Pathways-Organization-Id',
      'X-Pathways-User-Id',
    ],
  }
}
