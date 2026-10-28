import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { BadRequestException, ConflictException } from '@nestjs/common'
import {
  IMPORT_ENGINEERING_LIMITS,
  type ImportSourceColumn,
  type SupportedImportFileType,
} from '@pathways/imports/server'
import type { Prisma } from '@prisma/client'

export { stableJson } from '@pathways/imports/server'

export interface UploadedImportFile {
  buffer: Buffer
  originalname: string
  mimetype: string
  size: number
}

const fileTypes: Record<
  string,
  { type: SupportedImportFileType; contentTypes: readonly string[] }
> = {
  '.csv': { type: 'CSV', contentTypes: ['text/csv', 'application/csv', 'text/plain'] },
  '.xlsx': {
    type: 'XLSX',
    contentTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  '.xls': { type: 'XLS', contentTypes: ['application/vnd.ms-excel'] },
  '.pdf': { type: 'PDF', contentTypes: ['application/pdf'] },
}

export function checksum(input: Buffer | string) {
  return createHash('sha256').update(input).digest('hex')
}

// The canonical content type for a stored file type, used when a stored source is staged again.
export function fileContentType(type: SupportedImportFileType) {
  const definition = Object.values(fileTypes).find((entry) => entry.type === type)
  if (!definition) throw new ConflictException('The stored source file type is unsupported.')
  return definition.contentTypes[0]
}

export function fileMetadata(file?: UploadedImportFile) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('A source file is required.')
  }
  const name = file.originalname.trim()
  if (
    !name ||
    name.length > 128 ||
    name !== name.split(/[\\/]/).at(-1) ||
    Array.from(name).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  ) {
    throw new BadRequestException('The source filename is invalid.')
  }
  if (file.size !== file.buffer.length || file.size > IMPORT_ENGINEERING_LIMITS.maxBytes) {
    throw new BadRequestException('The source file exceeds the byte limit.')
  }
  const definition = fileTypes[extname(name).toLowerCase()]
  if (!definition || !definition.contentTypes.includes(file.mimetype.toLowerCase())) {
    throw new BadRequestException('The source extension and content type are not supported.')
  }
  return { name, ...definition, checksum: checksum(file.buffer), byteLength: file.size }
}

function sourceColumnKey(columnIndex: number) {
  return `column_${String(columnIndex).padStart(4, '0')}`
}

// Same pattern as the parser's code row: a letter then letters, digits or underscores, 2 to 40 characters.
const sourceCodePattern = /^[A-Za-z][A-Za-z0-9_]{1,39}$/

export function safeSourceColumns(value: Prisma.JsonValue): ImportSourceColumn[] {
  if (!Array.isArray(value) || value.length > IMPORT_ENGINEERING_LIMITS.maxSourceColumns) {
    throw new ConflictException('Stored import source columns are invalid.')
  }
  const columns = value.map((item, index): ImportSourceColumn => {
    if (typeof item === 'string') {
      return { key: item, header: item, columnIndex: index + 1 }
    }
    if (!item || Array.isArray(item) || typeof item !== 'object') {
      throw new ConflictException('Stored import source columns are invalid.')
    }
    const record = item as Record<string, unknown>
    const columnIndex = index + 1
    if (
      record.key !== sourceColumnKey(columnIndex) ||
      typeof record.header !== 'string' ||
      record.header.length < 1 ||
      record.header.length > IMPORT_ENGINEERING_LIMITS.maxHeaderCharacters ||
      record.columnIndex !== columnIndex ||
      (record.sourceCode !== undefined &&
        (typeof record.sourceCode !== 'string' || !sourceCodePattern.test(record.sourceCode)))
    ) {
      throw new ConflictException('Stored import source columns are invalid.')
    }
    return {
      key: record.key,
      header: record.header,
      columnIndex: record.columnIndex,
      ...(typeof record.sourceCode === 'string' ? { sourceCode: record.sourceCode } : {}),
    }
  })
  if (new Set(columns.map((column) => column.key)).size !== columns.length) {
    throw new ConflictException('Stored import source columns are invalid.')
  }
  return columns
}

export function safeRawData(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ConflictException('Stored raw import data is invalid.')
  }
  return value as Record<string, unknown>
}
