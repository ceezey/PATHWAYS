export const IMPORT_ENGINEERING_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxRows: 5_000,
  maxColumns: 100,
  maxCells: 250_000,
  maxCellCharacters: 10_000,
  maxHeaderCharacters: 100,
  maxWorkbookEntries: 2_000,
  maxWorkbookSheets: 10,
  maxUncompressedBytes: 25 * 1024 * 1024,
  maxCompressionRatio: 100,
  parseTimeoutMilliseconds: 5_000,
  processingClaimMilliseconds: 60_000,
  processingCheckpointRows: 25,
  maxProcessingAttempts: 3,
  previewRows: 100,
})

export type SupportedImportFileType = 'CSV' | 'XLSX' | 'XLS'
