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

// How long a browser may cache a CORS preflight (OPTIONS) response.
// Each browser clamps Access-Control-Max-Age to its own cap: Firefox 86400s,
// Chromium 7200s, WebKit about 600s. 86400 is the highest value any browser
// honors, so each one caches for its own maximum. This does not change which
// origins, methods or headers are allowed, only how long the preflight is reused.
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
