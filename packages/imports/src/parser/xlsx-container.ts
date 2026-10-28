import { IMPORT_ENGINEERING_LIMITS } from '../limits'
import { reject } from './matrix'

/** Refuses an XLSX zip container that is malformed, too large to unpack safely, or holds active content. */
export function inspectXlsxContainer(input: Uint8Array) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const u16 = (offset: number) => view.getUint16(offset, true)
  const u32 = (offset: number) => view.getUint32(offset, true)
  // Keeps a leading byte-order mark, as Node's Buffer utf8 decoding does.
  const utf8 = new TextDecoder('utf-8', { ignoreBOM: true })
  if (input.length < 4 || u32(0) !== 0x04034b50) {
    reject('FILE_SIGNATURE_INVALID', 'The XLSX file signature is invalid.')
  }
  const eocdSignature = 0x06054b50
  let eocd = -1
  for (let offset = Math.max(0, input.length - 65_557); offset <= input.length - 22; offset += 1) {
    if (u32(offset) === eocdSignature) eocd = offset
  }
  if (eocd < 0) reject('WORKBOOK_CONTAINER_INVALID', 'The XLSX container is incomplete.')
  const entries = u16(eocd + 10)
  const centralSize = u32(eocd + 12)
  const centralOffset = u32(eocd + 16)
  if (
    entries < 1 ||
    entries > IMPORT_ENGINEERING_LIMITS.maxWorkbookEntries ||
    centralOffset + centralSize > input.length
  ) {
    reject('WORKBOOK_CONTAINER_LIMIT', 'The XLSX container exceeds safe structural limits.')
  }
  let offset = centralOffset
  let totalCompressed = 0
  let totalUncompressed = 0
  const names: string[] = []
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > input.length || u32(offset) !== 0x02014b50) {
      reject('WORKBOOK_CONTAINER_INVALID', 'The XLSX directory is malformed.')
    }
    const flags = u16(offset + 8)
    if ((flags & 1) !== 0) reject('WORKBOOK_ENCRYPTED', 'Encrypted workbooks are not supported.')
    const compressed = u32(offset + 20)
    const uncompressed = u32(offset + 24)
    const nameLength = u16(offset + 28)
    const extraLength = u16(offset + 30)
    const commentLength = u16(offset + 32)
    const end = offset + 46 + nameLength + extraLength + commentLength
    if (end > input.length) reject('WORKBOOK_CONTAINER_INVALID', 'The XLSX directory is malformed.')
    const name = utf8.decode(input.subarray(offset + 46, offset + 46 + nameLength))
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) {
      reject('WORKBOOK_PATH_UNSAFE', 'The workbook contains an unsafe internal path.')
    }
    names.push(name.toLowerCase())
    totalCompressed += compressed
    totalUncompressed += uncompressed
    offset = end
  }
  if (
    totalUncompressed > IMPORT_ENGINEERING_LIMITS.maxUncompressedBytes ||
    (totalCompressed > 0 &&
      totalUncompressed / totalCompressed > IMPORT_ENGINEERING_LIMITS.maxCompressionRatio)
  ) {
    reject('WORKBOOK_DECOMPRESSION_LIMIT', 'The workbook exceeds decompression limits.')
  }
  if (!names.includes('[content_types].xml') || !names.includes('xl/workbook.xml')) {
    reject('WORKBOOK_STRUCTURE_INVALID', 'The XLSX package does not contain a workbook.')
  }
  if (
    names.some(
      (name) =>
        name.includes('vbaproject') ||
        name.startsWith('xl/externallinks/') ||
        name.startsWith('xl/embeddings/') ||
        name.startsWith('xl/oleobjects/'),
    )
  ) {
    reject('WORKBOOK_ACTIVE_CONTENT', 'Macros, external links, and embedded objects are forbidden.')
  }
}
