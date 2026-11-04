import { reject } from './matrix'

export type CsvEncoding = 'UTF-8' | 'UTF-16LE' | 'UTF-16BE' | 'WINDOWS-1252'

const BOMS: Array<{ bytes: number[]; encoding: CsvEncoding; label: string }> = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'UTF-8', label: 'utf-8' },
  { bytes: [0xff, 0xfe], encoding: 'UTF-16LE', label: 'utf-16le' },
  { bytes: [0xfe, 0xff], encoding: 'UTF-16BE', label: 'utf-16be' },
]

/** Decodes CSV bytes: a byte-order mark decides, else valid UTF-8, else Windows-1252; shared by the server and the browser check. */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  const bom = BOMS.find((candidate) =>
    candidate.bytes.every((byte, index) => bytes[index] === byte),
  )
  let text: string
  let encoding: CsvEncoding
  if (bom) {
    // The default decoder drops the leading mark, so it never reaches the first header.
    text = new TextDecoder(bom.label).decode(bytes)
    encoding = bom.encoding
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      encoding = 'UTF-8'
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes)
      encoding = 'WINDOWS-1252'
    }
  }
  if (text.includes('\u0000')) reject('CSV_BINARY_CONTENT', 'The CSV contains binary content.')
  return { text, encoding }
}
