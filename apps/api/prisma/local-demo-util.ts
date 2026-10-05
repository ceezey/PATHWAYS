import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import type { ProjectKey } from './local-demo-data'
import type { DemoContext, Staff } from './local-demo-seed'

export const projectOf = (ctx: DemoContext, key: ProjectKey) => {
  const id = ctx.projectIds.get(key)
  if (!id) throw new Error(`Project ${key} is not available.`)
  return id
}

export function message(error: unknown) {
  if (error && typeof error === 'object') {
    const response = (error as { response?: unknown }).response
    if (response && typeof response === 'object') return JSON.stringify(response)
    if (error instanceof Error) return error.message
  }
  return String(error)
}

const crcTable = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A plain colored PNG with a soft diagonal gradient, used as a field photo stand-in. */
export function fieldPhotoPng(seed: number, width = 640, height = 400) {
  const base = [
    [58, 122, 168],
    [96, 150, 96],
    [176, 128, 72],
    [128, 96, 152],
  ][seed % 4]
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const shade = 0.65 + 0.35 * ((x + y) / (width + height))
      const band = (Math.floor(x / 80) + Math.floor(y / 80)) % 2 ? 0.94 : 1
      for (let channel = 0; channel < 3; channel += 1)
        raw[row + 1 + x * 3 + channel] = Math.min(255, Math.round(base[channel] * shade * band))
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A small single-page PDF (attendance sheet or receipt) with plain text lines. */
export function textPdf(title: string, lines: string[]) {
  const escapeText = (value: string) => value.replace(/[\\()]/g, '\\$&')
  const content = [
    'BT /F1 16 Tf 56 780 Td',
    `(${escapeText(title)}) Tj`,
    '/F1 11 Tf',
    ...lines.map((line) => `0 -22 Td (${escapeText(line)}) Tj`),
    'ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out))
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** Labels a failing step so a stage failure names the exact call. */
export async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw new Error(`${label}: ${message(error)}`)
  }
}

export function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

// Prisma's 5-second interactive transaction default is too short for a hosted run over a slow link.
export const slowLinkTx = { maxWait: 15_000, timeout: 60_000 }

export type RuntimeTx = Parameters<Parameters<DemoContext['runtime']['$transaction']>[0]>[0]

/** Runs a read on the runtime role with the verified identity of one staff member, the same
 * session settings the API installs, so row level security decides what is visible. */
export async function asUser<T>(
  ctx: Pick<DemoContext, 'runtime' | 'organizationId'>,
  staff: Staff,
  run: (tx: RuntimeTx) => Promise<T>,
) {
  return ctx.runtime.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${staff.authUserId}, true),
      set_config('request.jwt.claims', '', true),
      set_config('app.organization_id', ${ctx.organizationId}, true),
      set_config('app.user_id', ${staff.userId}, true)`
    return run(tx as RuntimeTx)
  }, slowLinkTx)
}
