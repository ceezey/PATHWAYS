export type CspOrigins = {
  api: string
  supabase: string
  tiles: string[]
  extraConnect: string[]
  extraFrame: string[]
  extraScript: string[]
}

/** Sent on every response of both addresses, by the middleware and by next.config.ts. */
export const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
]

/** The Content-Security-Policy for one request; empty origins are left out. */
export function buildCsp(nonce: string, origins: CspOrigins): string {
  const { api, supabase, tiles, extraConnect, extraFrame, extraScript } = origins
  return [
    ['default-src', "'self'"],
    ['script-src', "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...extraScript],
    // Charts and Next write inline styles; scripts are the attack path.
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', api, supabase, ...tiles],
    ['media-src', "'self'", 'blob:', api, supabase],
    [
      'connect-src',
      "'self'",
      api,
      supabase,
      supabase.replace(/^http/, 'ws'),
      ...tiles,
      ...extraConnect,
    ],
    ['font-src', "'self'", 'data:'],
    ['worker-src', "'self'", 'blob:'],
    // The proof preview frames a PDF from a blob address the page itself made.
    ['frame-src', 'blob:', ...extraFrame],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]
    .map((directive) => directive.filter(Boolean).join(' '))
    .join('; ')
}
