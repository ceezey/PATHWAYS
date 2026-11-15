import { timingSafeEqual } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'

const FORBIDDEN_HEADERS = new Set([
  'cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-pathways-organization-id',
  'x-pathways-user-id',
])
const TOKEN = /^[a-f0-9]{64}$/

const empty = (value: unknown) =>
  value === undefined ||
  (value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Reflect.ownKeys(value).length === 0)

/** The daily job's bearer check, the same request rules as the rules machine boundary. */
export function assertBackupJobRequest(
  request: {
    method?: string
    rawHeaders?: unknown
    headers?: Record<string, unknown>
    body?: unknown
    query?: unknown
  },
  token: string,
): void {
  const deny = () => {
    throw new ForbiddenException('Backup job is unavailable.')
  }
  if (!TOKEN.test(token) || request.method !== 'POST') deny()
  if (!empty(request.body) || !empty(request.query)) deny()
  const raw = request.rawHeaders
  if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.some((v) => typeof v !== 'string')) deny()
  const authorization: string[] = []
  for (let i = 0; i < (raw as string[]).length; i += 2) {
    const name = (raw as string[])[i].toLowerCase()
    if (FORBIDDEN_HEADERS.has(name)) deny()
    if (name === 'authorization') authorization.push((raw as string[])[i + 1])
  }
  const header = request.headers?.authorization
  if (
    authorization.length !== 1 ||
    typeof header !== 'string' ||
    header.length !== 71 ||
    header !== authorization[0] ||
    !/^Bearer [a-f0-9]{64}$/.test(header)
  )
    deny()
  for (const name of FORBIDDEN_HEADERS) if (request.headers?.[name] !== undefined) deny()
  if (!timingSafeEqual(Buffer.from((header as string).slice(7), 'hex'), Buffer.from(token, 'hex')))
    deny()
}
