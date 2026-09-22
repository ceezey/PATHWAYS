import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { projectScope } from '@app/modules/auth/authorized-data.service'
import { withAuthorizedOperation } from '@app/modules/auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '@app/modules/auth/developer-access'
import { BeneficiariesService } from '@app/modules/beneficiaries/beneficiaries.service'
import { ParticipantsService } from '@app/modules/participants/participants.service'
import { StorageService } from '@app/modules/storage/storage.service'
import { PrismaService } from '@app/prisma/prisma.service'
import { readApiEnv } from '@pathways/config'
import {
  IMPORT_ENGINEERING_LIMITS,
  ImportParseError,
  type ImportSourceColumn,
  type SupportedImportFileType,
  normalizeImportedRow,
  parseSecureImport,
} from '@pathways/imports/server'
import type { FormFieldValidationContract } from '@pathways/shared'
import type {
  ImportRowsQueryDto,
  ProcessImportDto,
  SaveImportMappingDto,
  UploadImportDto,
  ValidateImportDto,
} from './imports.dto'
import { W10FinalizationFault } from './p07-w10-finalization-fault'

type Tx = Prisma.TransactionClient

export interface UploadedImportFile {
  buffer: Buffer
  originalname: string
  mimetype: string
  size: number
}

const REGISTRATION_IMPORT_TRANSACTION_TIMEOUT_MS = 20_000
const PARTICIPATION_IMPORT_TRANSACTION_TIMEOUT_MS = 20_000

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
}

const batchSelection = {
  id: true,
  projectId: true,
  formId: true,
  formVersion: true,
  originalFileName: true,
  fileType: true,
  sourceChecksum: true,
  clientImportId: true,
  storageStatus: true,
  status: true,
  mappingRevision: true,
  validationRevision: true,
  validatedMappingRevision: true,
  processingRevision: true,
  totalRows: true,
  validRows: true,
  invalidRows: true,
  processedRows: true,
  unprocessedRows: true,
  failedRows: true,
  failureCode: true,
  uploadedById: true,
  reviewedById: true,
  uploadedAt: true,
  validatedAt: true,
  processedAt: true,
  updatedAt: true,
  form: {
    select: { code: true, name: true, formType: true, status: true },
  },
} satisfies Prisma.DataImportBatchSelect

type BatchRow = Prisma.DataImportBatchGetPayload<{ select: typeof batchSelection }>

const fieldSelection = {
  id: true,
  code: true,
  label: true,
  dataType: true,
  isRequired: true,
  allowedValues: true,
  minimumValue: true,
  maximumValue: true,
  minimumDate: true,
  maximumDate: true,
  minimumLength: true,
  maximumLength: true,
  isMetadataKey: true,
} satisfies Prisma.FormFieldSelect

type FieldRow = Prisma.FormFieldGetPayload<{ select: typeof fieldSelection }>

function jsonStrings(value: Prisma.JsonValue | null) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

function contract(field: FieldRow): FormFieldValidationContract {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    allowedValues: jsonStrings(field.allowedValues),
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
  }
}

function mapBatch(batch: BatchRow) {
  return {
    id: batch.id,
    projectId: batch.projectId,
    formId: batch.formId,
    formVersion: batch.formVersion,
    formCode: batch.form.code,
    formName: batch.form.name,
    formType: batch.form.formType,
    originalFileName: batch.originalFileName,
    fileType: batch.fileType,
    clientImportId: batch.clientImportId,
    storageStatus: batch.storageStatus,
    status: batch.status,
    mappingRevision: batch.mappingRevision,
    validationRevision: batch.validationRevision,
    validatedMappingRevision: batch.validatedMappingRevision,
    processingRevision: batch.processingRevision,
    totals: {
      rows: batch.totalRows,
      valid: batch.validRows,
      invalid: batch.invalidRows,
      processed: batch.processedRows,
      unprocessed: batch.unprocessedRows,
      failed: batch.failedRows,
    },
    failureCode: batch.failureCode,
    uploadedAt: batch.uploadedAt.toISOString(),
    validatedAt: batch.validatedAt?.toISOString(),
    processedAt: batch.processedAt?.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  }
}

function checksum(input: Buffer | string) {
  return createHash('sha256').update(input).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function fileMetadata(file?: UploadedImportFile) {
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

function safeSourceColumns(value: Prisma.JsonValue): ImportSourceColumn[] {
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
      record.columnIndex !== columnIndex
    ) {
      throw new ConflictException('Stored import source columns are invalid.')
    }
    return {
      key: record.key,
      header: record.header,
      columnIndex: record.columnIndex,
    }
  })
  if (new Set(columns.map((column) => column.key)).size !== columns.length) {
    throw new ConflictException('Stored import source columns are invalid.')
  }
  return columns
}

function safeRawData(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ConflictException('Stored raw import data is invalid.')
  }
  return value as Record<string, unknown>
}

@Injectable()
export class ImportsService {
  private readonly w10FinalizationFault = new W10FinalizationFault()
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(BeneficiariesService) private readonly beneficiaries: BeneficiariesService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  listBatches(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', async (tx, actor) => {
      const scopedProjectId = await this.requireProject(tx, actor, projectId)
      const batches = await tx.dataImportBatch.findMany({
        where: { organizationId: actor.organizationId, projectId: scopedProjectId },
        select: batchSelection,
        orderBy: { createdAt: 'desc' },
        take: IMPORT_ENGINEERING_LIMITS.processingCheckpointRows,
      })
      return batches.map(mapBatch)
    })
  }

  getBatch(identity: ApplicationIdentity, projectId: string, batchId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', async (tx, actor) => {
      const batch = await this.requireBatch(tx, actor, projectId, batchId)
      const mappings = await tx.metadataMapping.findMany({
        where: { importBatchId: batch.id, revision: batch.mappingRevision },
        select: {
          sourceFieldName: true,
          status: true,
          revision: true,
          targetField: { select: { code: true, label: true } },
          validationMessage: true,
        },
        orderBy: { sourceFieldName: 'asc' },
        take: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
      })
      const stored = await tx.dataImportBatch.findUnique({
        where: { id: batch.id },
        select: { sourceHeaders: true },
      })
      const sourceColumns = stored ? safeSourceColumns(stored.sourceHeaders) : []
      return {
        ...mapBatch(batch),
        sourceHeaders: sourceColumns.map((column) => column.key),
        sourceColumns,
        mappings,
      }
    })
  }

  listRows(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    query: ImportRowsQueryDto,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', async (tx, actor) => {
      const batch = await this.requireBatch(tx, actor, projectId, batchId)
      const rows = await tx.dataImportRow.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          importBatchId: batch.id,
        },
        select: {
          id: true,
          rowNumber: true,
          rawData: true,
          status: true,
          validationErrors: true,
          mappingRevision: true,
          validationRevision: true,
          processingAttempts: true,
          processingErrorCode: true,
          updatedAt: true,
        },
        orderBy: { rowNumber: 'asc' },
        skip: query.offset,
        take: query.take,
      })
      return {
        offset: query.offset,
        take: query.take,
        total: batch.totalRows,
        rows: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      }
    })
  }

  async upload(
    identity: ApplicationIdentity,
    projectId: string,
    input: UploadImportDto,
    file?: UploadedImportFile,
  ) {
    if (!file) throw new BadRequestException('A source file is required.')
    const metadata = fileMetadata(file)
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Private upload storage is not configured.')
    }
    const reservation = await this.reserveUpload(identity, projectId, input, metadata)
    if (!reservation.requiresFinalization) {
      return this.getBatch(identity, projectId, reservation.batchId)
    }

    let stored = false
    try {
      await this.storage.uploadPrivateFile(
        reservation.storageBucket,
        reservation.storageObjectKey,
        file.buffer,
        file.mimetype,
      )
      stored = true
    } catch {
      try {
        const existing = await this.storage.downloadPrivateFile(
          reservation.storageBucket,
          reservation.storageObjectKey,
        )
        if (checksum(existing) !== metadata.checksum) throw new Error('Stored checksum mismatch.')
        stored = true
      } catch {
        await this.markUploadFailure(
          identity,
          projectId,
          reservation.batchId,
          'STORAGE_WRITE_FAILED',
        )
        throw new ServiceUnavailableException('The private source file could not be stored.')
      }
    }

    let parsed: Awaited<ReturnType<typeof parseSecureImport>>
    try {
      parsed = await parseSecureImport(file.buffer, metadata.type)
    } catch (error) {
      const failureCode =
        error instanceof ImportParseError ? error.code.slice(0, 64) : 'PARSER_REJECTED_INPUT'
      await this.markUploadFailure(identity, projectId, reservation.batchId, failureCode, stored)
      if (error instanceof ImportParseError) {
        throw new BadRequestException({ message: error.message, code: error.code })
      }
      throw new BadRequestException('The source file could not be parsed safely.')
    }

    try {
      return await this.finalizeUpload(identity, projectId, reservation.batchId, parsed)
    } catch (error) {
      const recoveryRecorded = await this.markRecoveryRequired(
        identity,
        projectId,
        reservation.batchId,
      )
      if (
        error instanceof HttpException &&
        !(error instanceof ForbiddenException && recoveryRecorded)
      ) {
        throw error
      }
      throw new ServiceUnavailableException(
        'The file is stored privately, but database finalization must be retried.',
      )
    }
  }

  async resumeUpload(identity: ApplicationIdentity, projectId: string, batchId: string) {
    const reservation = await withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.upload',
      async (tx, actor) => {
        const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
        if (!['UPLOADING', 'RECOVERY_REQUIRED'].includes(batch.status)) {
          return { complete: true as const, batchId: batch.id }
        }
        return {
          complete: false as const,
          batchId: batch.id,
          storageBucket: batch.storageBucket,
          storageObjectKey: batch.storageObjectKey,
          fileType: batch.fileType as SupportedImportFileType,
          sourceChecksum: batch.sourceChecksum,
        }
      },
    )
    if (reservation.complete) return this.getBatch(identity, projectId, reservation.batchId)
    let source: Buffer
    try {
      source = await this.storage.downloadPrivateFile(
        reservation.storageBucket,
        reservation.storageObjectKey,
      )
    } catch {
      throw new ServiceUnavailableException(
        'The private source object is unavailable for recovery.',
      )
    }
    if (checksum(source) !== reservation.sourceChecksum) {
      await this.markUploadFailure(identity, projectId, batchId, 'STORAGE_CHECKSUM_MISMATCH')
      throw new ConflictException('The stored source checksum does not match its reservation.')
    }
    const parsed = await parseSecureImport(source, reservation.fileType)
    return this.finalizeUpload(identity, projectId, batchId, parsed)
  }

  saveMapping(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: SaveImportMappingDto,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.review', async (tx, actor) => {
      await this.lockBatch(tx, actor, projectId, batchId)
      const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
      if (batch.processingRevision > 0) {
        throw new ConflictException('Mappings cannot change after row processing has started.')
      }
      if (!['UPLOADED', 'MAPPED', 'VALIDATED'].includes(batch.status)) {
        throw new ConflictException('This import is not ready for mapping.')
      }
      if (batch.mappingRevision !== input.expectedMappingRevision) {
        throw new ConflictException('The mapping changed; reload before saving.')
      }
      const sourceColumns = safeSourceColumns(batch.sourceHeaders)
      const sourceColumnKeys = sourceColumns.map((column) => column.key)
      if (input.mappings.length !== sourceColumnKeys.length) {
        throw new BadRequestException('Every source column must be mapped or explicitly ignored.')
      }
      const byHeader = new Map(input.mappings.map((item) => [item.sourceFieldName, item]))
      if (
        byHeader.size !== input.mappings.length ||
        sourceColumnKeys.some((key) => !byHeader.has(key))
      ) {
        throw new BadRequestException(
          'Mappings must reference each original source column exactly once.',
        )
      }
      const fields = await tx.formField.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
        },
        select: { id: true, code: true },
        take: IMPORT_ENGINEERING_LIMITS.maxMappedFields,
      })
      const byCode = new Map(fields.map((field) => [field.code, field]))
      const targets = new Set<string>()
      const revision = batch.mappingRevision + 1
      const data: Prisma.MetadataMappingCreateManyInput[] = sourceColumnKeys.map((sourceKey) => {
        const item = byHeader.get(sourceKey)
        if (!item) throw new BadRequestException('A source column mapping is missing.')
        if (item.ignored === Boolean(item.targetFieldCode)) {
          throw new BadRequestException('Each source column must be mapped or ignored, not both.')
        }
        if (item.ignored) {
          return {
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            formId: batch.formId,
            importBatchId: batch.id,
            revision,
            sourceFieldName: sourceKey,
            status: 'IGNORED',
          }
        }
        const target = byCode.get(item.targetFieldCode ?? '')
        if (!target) throw new BadRequestException('A mapping targets an unavailable form field.')
        if (targets.has(target.id)) {
          throw new BadRequestException('Two source columns cannot target the same form field.')
        }
        if (targets.size >= IMPORT_ENGINEERING_LIMITS.maxMappedFields) {
          throw new BadRequestException('The mapping targets too many form fields.')
        }
        targets.add(target.id)
        return {
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
          importBatchId: batch.id,
          revision,
          sourceFieldName: sourceKey,
          targetFieldId: target.id,
          status: 'MAPPED',
        }
      })
      await tx.metadataMapping.createMany({ data })
      await tx.dataImportRow.updateMany({
        where: { importBatchId: batch.id, organizationId: actor.organizationId },
        data: {
          status: 'PENDING',
          normalizedData: Prisma.DbNull,
          validationErrors: [],
          mappingRevision: revision,
          validationRevision: 0,
          validatedById: null,
          validatedAt: null,
          processingClaimId: null,
          processingClaimedAt: null,
          processingErrorCode: null,
        },
      })
      await tx.dataImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'MAPPED',
          mappingRevision: revision,
          validatedMappingRevision: null,
          reviewedById: null,
          validRows: 0,
          invalidRows: 0,
          processedRows: 0,
          unprocessedRows: 0,
          failedRows: 0,
          validatedAt: null,
          processedAt: null,
          failureCode: null,
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: batch.projectId,
          action: 'IMPORT_MAPPING_REVISED',
          entityType: 'DataImportBatch',
          entityId: batch.id,
          changes: {
            revision,
            mapped: targets.size,
            ignored: sourceColumnKeys.length - targets.size,
          },
        },
      })
      return this.mapStoredBatch(tx, actor, batch.projectId, batch.id)
    })
  }

  validate(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ValidateImportDto,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.review', async (tx, actor) => {
      await this.lockBatch(tx, actor, projectId, batchId)
      const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
      if (batch.mappingRevision !== input.expectedMappingRevision || batch.mappingRevision < 1) {
        throw new ConflictException('The mapping revision is stale or incomplete.')
      }
      if (batch.processingRevision > 0) {
        throw new ConflictException('A processed import cannot be revalidated.')
      }
      const mappings = await tx.metadataMapping.findMany({
        where: { importBatchId: batch.id, revision: batch.mappingRevision },
        select: {
          sourceFieldName: true,
          status: true,
          targetField: { select: fieldSelection },
        },
        take: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
      })
      if (mappings.length !== safeSourceColumns(batch.sourceHeaders).length) {
        throw new ConflictException('The reviewed mapping is incomplete.')
      }
      const mappedFields = mappings.flatMap((mapping) =>
        mapping.status === 'MAPPED' && mapping.targetField ? [mapping.targetField] : [],
      )
      const fields = mappedFields.map(contract)
      const requiredCodes = await tx.formField.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
          isRequired: true,
        },
        select: { code: true },
      })
      const mappedCodes = new Set(fields.map((field) => field.code))
      if (requiredCodes.some((field) => !mappedCodes.has(field.code))) {
        throw new BadRequestException('Every required form field must have a source mapping.')
      }
      const rows = await tx.dataImportRow.findMany({
        where: { organizationId: actor.organizationId, importBatchId: batch.id },
        select: { id: true, rowNumber: true, rawData: true },
        orderBy: { rowNumber: 'asc' },
        take: IMPORT_ENGINEERING_LIMITS.maxRows,
      })
      const validationRevision = batch.validationRevision + 1
      const results = rows.map((row) => {
        const raw = safeRawData(row.rawData)
        const byFieldCode = Object.create(null) as Record<string, unknown>
        for (const mapping of mappings) {
          if (mapping.status === 'MAPPED' && mapping.targetField) {
            byFieldCode[mapping.targetField.code] = raw[mapping.sourceFieldName]
          }
        }
        return { row, result: normalizeImportedRow(fields, byFieldCode) }
      })
      const metadataKeys = mappedFields
        .filter((field) => field.isMetadataKey)
        .map((field) => field.code)
      if (metadataKeys.length > 0) {
        const seen = new Map<string, number[]>()
        results.forEach(({ result }, index) => {
          if (!result.valid) return
          const key = stableJson(metadataKeys.map((code) => result.values[code]))
          const entries = seen.get(key) ?? []
          entries.push(index)
          seen.set(key, entries)
        })
        for (const duplicates of seen.values()) {
          if (duplicates.length < 2) continue
          for (const index of duplicates) {
            results[index].result.valid = false
            results[index].result.errors.push({
              fieldCode: metadataKeys.join(','),
              code: 'DUPLICATE_BUSINESS_KEY',
              message: 'The metadata key is duplicated within this import.',
            })
          }
        }
      }
      let valid = 0
      let invalid = 0
      const validatedAt = new Date()
      const rowUpdates = results.map(({ row, result }) => {
        if (result.valid) valid += 1
        else invalid += 1
        return {
          id: row.id,
          status: result.valid ? 'VALID' : 'INVALID',
          normalized_data: result.valid ? result.values : null,
          validation_errors: result.errors,
        }
      })
      const updatedRows = await tx.$executeRaw(Prisma.sql`
        UPDATE pathways.data_import_rows AS r
        SET status=v.status::pathways.import_row_status,
          normalized_data=v.normalized_data,
          validation_errors=v.validation_errors,
          mapping_revision=${batch.mappingRevision},
          validation_revision=${validationRevision},
          validated_by_id=${actor.userId}::uuid,
          validated_at=${validatedAt},
          processed_at=NULL,
          processing_claim_id=NULL,
          processing_claimed_at=NULL,
          processing_error_code=NULL
        FROM jsonb_to_recordset(${JSON.stringify(rowUpdates)}::jsonb)
          AS v(id uuid,status text,normalized_data jsonb,validation_errors jsonb)
        WHERE r.id=v.id AND r.organization_id=${actor.organizationId}::uuid
          AND r.import_batch_id=${batch.id}::uuid
          AND r.status IN ('PENDING','VALID','INVALID')
      `)
      if (updatedRows !== rows.length) {
        throw new ConflictException('Import rows changed while validation was running.')
      }
      await tx.dataImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'VALIDATED',
          validationRevision,
          validatedMappingRevision: batch.mappingRevision,
          reviewedById: actor.userId,
          validRows: valid,
          invalidRows: invalid,
          processedRows: 0,
          unprocessedRows: 0,
          failedRows: 0,
          validatedAt,
          processedAt: null,
          failureCode: null,
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: batch.projectId,
          action: 'IMPORT_VALIDATED',
          entityType: 'DataImportBatch',
          entityId: batch.id,
          changes: {
            mappingRevision: batch.mappingRevision,
            validationRevision,
            total: rows.length,
            valid,
            invalid,
          },
        },
      })
      return this.mapStoredBatch(tx, actor, batch.projectId, batch.id)
    })
  }

  async process(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ProcessImportDto,
  ) {
    const claim = await this.claimRows(identity, projectId, batchId, input)
    if (claim.complete) return this.getBatch(identity, projectId, batchId)
    for (const rowId of claim.rowIds) {
      try {
        if (claim.registrationHandler) {
          await this.promoteRegistrationRow(
            identity,
            projectId,
            batchId,
            rowId,
            claim.claimId,
            input.expectedValidationRevision,
          )
        } else if (claim.participationHandler) {
          await this.promoteParticipationRow(
            identity,
            projectId,
            batchId,
            rowId,
            claim.claimId,
            input.expectedValidationRevision,
          )
        } else {
          await this.promoteGenericRow(
            identity,
            projectId,
            batchId,
            rowId,
            claim.claimId,
            input.expectedValidationRevision,
          )
        }
      } catch (error) {
        if (error instanceof ForbiddenException) throw error
        await this.releaseFailedRow(identity, projectId, batchId, rowId, claim.claimId).catch(
          () => undefined,
        )
      }
    }
    return this.finishClaim(identity, projectId, batchId, claim.claimId)
  }

  private reserveUpload(
    identity: ApplicationIdentity,
    projectId: string,
    input: UploadImportDto,
    metadata: ReturnType<typeof fileMetadata>,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', async (tx, actor) => {
      const scopedProjectId = await this.requireProject(tx, actor, projectId)
      if (!UUID_PATTERN.test(input.formId))
        throw new NotFoundException('Published form unavailable.')
      const form = await tx.digitalForm.findFirst({
        where: {
          id: input.formId.toLowerCase(),
          organizationId: actor.organizationId,
          projectId: scopedProjectId,
          status: 'PUBLISHED',
        },
        select: { id: true, version: true },
      })
      if (!form) throw new NotFoundException('Published form unavailable.')
      const existing = await tx.dataImportBatch.findFirst({
        where: {
          organizationId: actor.organizationId,
          uploadedById: actor.userId,
          clientImportId: input.clientImportId.toLowerCase(),
        },
        select: {
          id: true,
          projectId: true,
          formId: true,
          formVersion: true,
          originalFileName: true,
          fileType: true,
          sourceChecksum: true,
          storageBucket: true,
          storageObjectKey: true,
          status: true,
        },
      })
      if (existing) {
        if (
          existing.projectId !== scopedProjectId ||
          existing.formId !== form.id ||
          existing.formVersion !== form.version ||
          existing.originalFileName !== metadata.name ||
          existing.fileType !== metadata.type ||
          existing.sourceChecksum !== metadata.checksum
        ) {
          throw new ConflictException('The import idempotency key was reused for different input.')
        }
        return {
          batchId: existing.id,
          storageBucket: existing.storageBucket,
          storageObjectKey: existing.storageObjectKey,
          requiresFinalization: ['UPLOADING', 'RECOVERY_REQUIRED'].includes(existing.status),
        }
      }
      const id = randomUUID()
      const storageBucket = this.env.UPLOADS_BUCKET
      const storageObjectKey = `organizations/${actor.organizationId}/projects/${scopedProjectId}/imports/${id}/${metadata.checksum}.${metadata.type.toLowerCase()}`
      await tx.dataImportBatch.create({
        data: {
          id,
          organizationId: actor.organizationId,
          projectId: scopedProjectId,
          formId: form.id,
          formVersion: form.version,
          sourceSystem: 'MANUAL_UPLOAD',
          originalFileName: metadata.name,
          fileType: metadata.type,
          sourceChecksum: metadata.checksum,
          clientImportId: input.clientImportId.toLowerCase(),
          storageBucket,
          storageObjectKey,
          uploadedById: actor.userId,
          status: 'UPLOADING',
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: scopedProjectId,
          action: 'IMPORT_UPLOAD_RESERVED',
          entityType: 'DataImportBatch',
          entityId: id,
          changes: { fileType: metadata.type, byteLength: metadata.byteLength },
        },
      })
      return { batchId: id, storageBucket, storageObjectKey, requiresFinalization: true }
    })
  }

  private finalizeUpload(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    parsed: Awaited<ReturnType<typeof parseSecureImport>>,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', async (tx, actor) => {
      await this.lockBatch(tx, actor, projectId, batchId)
      const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
      if (batch.totalRows > 0 && batch.status !== 'RECOVERY_REQUIRED') {
        return this.mapStoredBatch(tx, actor, batch.projectId, batch.id)
      }
      if (!['UPLOADING', 'RECOVERY_REQUIRED'].includes(batch.status)) {
        throw new ConflictException('This upload cannot be finalized again.')
      }
      if (
        this.w10FinalizationFault.consume({
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
          clientImportId: batch.clientImportId,
          sourceChecksum: batch.sourceChecksum,
          storageBucket: batch.storageBucket,
          storageStatus: batch.storageStatus,
          status: batch.status,
          totalRows: batch.totalRows,
        })
      ) {
        // The authorized transaction rolls back. The upload catch records RECOVERY_REQUIRED.
        throw new Error('P07_W10_SYNTHETIC_FINALIZATION_FAILURE')
      }
      await tx.dataImportRow.createMany({
        data: parsed.rows.map((row) => ({
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
          importBatchId: batch.id,
          rowNumber: row.sourceRowNumber,
          sourceChecksum: checksum(stableJson(row.values)),
          rawData: row.values as Prisma.InputJsonValue,
        })),
      })
      await tx.dataImportBatch.update({
        where: { id: batch.id },
        data: {
          storageStatus: 'STORED',
          sourceHeaders: parsed.sourceColumns as unknown as Prisma.InputJsonValue,
          status: 'UPLOADED',
          totalRows: parsed.rows.length,
          failureCode: null,
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: batch.projectId,
          action: 'IMPORT_UPLOAD_STAGED',
          entityType: 'DataImportBatch',
          entityId: batch.id,
          changes: {
            fileType: batch.fileType,
            rows: parsed.rows.length,
            columns: parsed.sourceColumns.length,
            sheets: parsed.sheetNames.length,
          },
        },
      })
      return this.mapStoredBatch(tx, actor, batch.projectId, batch.id)
    })
  }

  private markUploadFailure(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    failureCode: string,
    stored = false,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', async (tx, actor) => {
      const batch = await this.requireBatch(tx, actor, projectId, batchId)
      await tx.dataImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'FAILED',
          storageStatus: stored ? 'STORED' : 'FAILED',
          failureCode: failureCode.slice(0, 64),
        },
      })
    })
  }

  private markRecoveryRequired(identity: ApplicationIdentity, projectId: string, batchId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', async (tx, actor) => {
      const batch = await this.requireBatch(tx, actor, projectId, batchId)
      await tx.dataImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'RECOVERY_REQUIRED',
          storageStatus: 'RECOVERY_REQUIRED',
          failureCode: 'DATABASE_FINALIZATION_FAILED',
        },
      })
      return true
    }).catch(() => false)
  }

  private claimRows(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ProcessImportDto,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', async (tx, actor) => {
      await this.lockBatch(tx, actor, projectId, batchId)
      const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
      if (
        batch.validationRevision !== input.expectedValidationRevision ||
        batch.validatedMappingRevision !== batch.mappingRevision
      ) {
        throw new ConflictException('The current mapping has not been validated.')
      }
      if (batch.status === 'PROCESSED') {
        return {
          complete: true,
          rowIds: [],
          claimId: '',
          registrationHandler: false,
          participationHandler: false,
        }
      }
      if (!['VALIDATED', 'PARTIALLY_PROCESSED', 'PROCESSING'].includes(batch.status)) {
        throw new ConflictException('This import is not ready for processing.')
      }
      const expiry = new Date(Date.now() - IMPORT_ENGINEERING_LIMITS.processingClaimMilliseconds)
      if (
        batch.processingClaimId &&
        batch.processingClaimedAt &&
        batch.processingClaimedAt > expiry
      ) {
        throw new ConflictException('Another worker currently owns this import claim.')
      }
      await tx.dataImportRow.updateMany({
        where: {
          importBatchId: batch.id,
          status: 'PROCESSING',
          processingClaimedAt: { lt: expiry },
          processingAttempts: { lt: IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts },
        },
        data: { status: 'VALID', processingClaimId: null, processingClaimedAt: null },
      })
      await tx.dataImportRow.updateMany({
        where: {
          importBatchId: batch.id,
          status: 'PROCESSING',
          processingClaimedAt: { lt: expiry },
          processingAttempts: { gte: IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts },
        },
        data: {
          status: 'FAILED',
          processingClaimId: null,
          processingClaimedAt: null,
          processingErrorCode: 'RETRY_LIMIT_EXCEEDED',
        },
      })
      const candidates = await tx.dataImportRow.findMany({
        where: {
          organizationId: actor.organizationId,
          importBatchId: batch.id,
          status: 'VALID',
          mappingRevision: batch.mappingRevision,
          validationRevision: batch.validationRevision,
          processingAttempts: { lt: IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts },
        },
        select: { id: true },
        orderBy: { rowNumber: 'asc' },
        take: 100,
      })
      if (candidates.length === 0) {
        await this.reconcileBatch(tx, batch.id)
        return {
          complete: true,
          rowIds: [],
          claimId: '',
          registrationHandler: false,
          participationHandler: false,
        }
      }
      const claimId = randomUUID()
      const claimedAt = new Date()
      const rowIds = candidates.map((row) => row.id)
      const claimed = await tx.dataImportRow.updateMany({
        where: { id: { in: rowIds }, status: 'VALID' },
        data: {
          status: 'PROCESSING',
          processingClaimId: claimId,
          processingClaimedAt: claimedAt,
          processingAttempts: { increment: 1 },
          processingErrorCode: null,
        },
      })
      if (claimed.count !== rowIds.length) {
        throw new ConflictException('The processing claim changed concurrently.')
      }
      await tx.dataImportBatch.update({
        where: { id: batch.id },
        data: {
          status: 'PROCESSING',
          processingRevision: { increment: 1 },
          processingClaimId: claimId,
          processingClaimedAt: claimedAt,
          failureCode: null,
        },
      })
      return {
        complete: false,
        rowIds,
        claimId,
        registrationHandler: batch.form.formType === 'BENEFICIARY_REGISTRATION',
        participationHandler: batch.form.formType === 'ACTIVITY_MONITORING',
      }
    })
  }

  private promoteRegistrationRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
    validationRevision: number,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.process',
      async (tx, actor) => {
        const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
        if (
          batch.status !== 'PROCESSING' ||
          batch.processingClaimId !== claimId ||
          batch.validationRevision !== validationRevision ||
          batch.validatedMappingRevision !== batch.mappingRevision ||
          !batch.reviewedById ||
          batch.form.formType !== 'BENEFICIARY_REGISTRATION'
        ) {
          throw new ConflictException('The registration processing claim is stale.')
        }
        const row = await tx.dataImportRow.findFirst({
          where: {
            id: rowId,
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            importBatchId: batch.id,
            status: 'PROCESSING',
            processingClaimId: claimId,
            mappingRevision: batch.mappingRevision,
            validationRevision: batch.validationRevision,
          },
          select: { id: true, rowNumber: true, normalizedData: true },
        })
        if (!row) throw new ConflictException('The registration row claim is unavailable.')
        const outcome = await this.beneficiaries.promoteRegistration(tx, actor, {
          projectId: batch.projectId,
          formId: batch.formId,
          clientRegistrationId: row.id,
          values: safeRawData(row.normalizedData as Prisma.JsonValue),
          source: 'IMPORTED_DATASET',
          validatedById: batch.reviewedById,
          importBatchId: batch.id,
          importRowId: row.id,
        })
        const finishedAt = new Date()
        if (outcome.kind === 'REVIEW') {
          await tx.dataImportRow.update({
            where: { id: row.id },
            data: {
              status: 'UNPROCESSED',
              processingErrorCode: outcome.code,
              processingClaimId: null,
              processingClaimedAt: null,
            },
          })
          await tx.auditLog.create({
            data: {
              organizationId: actor.organizationId,
              actorUserId: actor.userId,
              projectId: batch.projectId,
              action: 'IMPORT_REGISTRATION_REVIEW_REQUIRED',
              entityType: 'DataImportRow',
              entityId: row.id,
              changes: {
                importBatchId: batch.id,
                sourceRowNumber: row.rowNumber,
                code: outcome.code,
              },
            },
          })
          return
        }
        await tx.dataImportRow.update({
          where: { id: row.id },
          data: {
            status: 'PROCESSED',
            processedAt: finishedAt,
            processingErrorCode: null,
            processingClaimId: null,
            processingClaimedAt: null,
          },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: batch.projectId,
            action: 'IMPORT_REGISTRATION_ROW_COMMITTED',
            entityType: 'DataImportRow',
            entityId: row.id,
            changes: {
              importBatchId: batch.id,
              sourceRowNumber: row.rowNumber,
              beneficiaryId: outcome.beneficiaryId,
              enrollmentId: outcome.enrollmentId,
              submissionId: outcome.submissionId,
            },
          },
        })
      },
      { transactionTimeoutMs: REGISTRATION_IMPORT_TRANSACTION_TIMEOUT_MS },
    )
  }

  private promoteParticipationRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
    validationRevision: number,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.process',
      async (tx, actor) => {
        const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
        if (
          batch.status !== 'PROCESSING' ||
          batch.processingClaimId !== claimId ||
          batch.validationRevision !== validationRevision ||
          batch.validatedMappingRevision !== batch.mappingRevision ||
          !batch.reviewedById ||
          batch.form.formType !== 'ACTIVITY_MONITORING'
        )
          throw new ConflictException('The participation processing claim is stale.')
        const row = await tx.dataImportRow.findFirst({
          where: {
            id: rowId,
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            importBatchId: batch.id,
            status: 'PROCESSING',
            processingClaimId: claimId,
            mappingRevision: batch.mappingRevision,
            validationRevision: batch.validationRevision,
          },
          select: { id: true, rowNumber: true, normalizedData: true },
        })
        if (!row) throw new ConflictException('The participation row claim is unavailable.')
        const existing = await tx.formSubmission.findUnique({
          where: { importRowId: row.id },
          select: { id: true },
        })
        if (existing) {
          const participation = await tx.beneficiaryActivityParticipation.findUnique({
            where: { sourceSubmissionId: existing.id },
            select: { id: true },
          })
          if (!participation)
            throw new ConflictException(
              'The imported submission is missing its participation effect.',
            )
          await tx.dataImportRow.update({
            where: { id: row.id },
            data: {
              status: 'PROCESSED',
              processedAt: new Date(),
              processingClaimId: null,
              processingClaimedAt: null,
              processingErrorCode: null,
            },
          })
          return
        }
        const values = safeRawData(row.normalizedData as Prisma.JsonValue)
        const fields = await tx.formField.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            formId: batch.formId,
          },
          select: fieldSelection,
          orderBy: { sequenceNo: 'asc' },
          take: IMPORT_ENGINEERING_LIMITS.maxMappedFields,
        })
        const verified = normalizeImportedRow(fields.map(contract), values)
        if (!verified.valid) throw new ConflictException('The normalized row no longer validates.')
        const form = await tx.digitalForm.findFirst({
          where: {
            id: batch.formId,
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            version: batch.formVersion,
            formType: 'ACTIVITY_MONITORING',
            status: 'PUBLISHED',
          },
          select: { id: true, version: true, activityId: true, journeyStageId: true },
        })
        if (!form)
          throw new ConflictException('The activity-monitoring form version is unavailable.')
        const submission = await tx.formSubmission.create({
          data: {
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            formId: batch.formId,
            formVersion: batch.formVersion,
            clientSubmissionId: row.id,
            importBatchId: batch.id,
            importRowId: row.id,
            submittedById: actor.userId,
            source: 'IMPORTED_DATASET',
            status: 'DRAFT',
          },
          select: { id: true },
        })
        await tx.formResponseValue.createMany({
          data: fields.map((field) => ({
            organizationId: actor.organizationId,
            projectId: batch.projectId,
            formId: batch.formId,
            submissionId: submission.id,
            fieldId: field.id,
            value:
              verified.values[field.code] === null
                ? Prisma.JsonNull
                : (verified.values[field.code] as Prisma.InputJsonValue),
          })),
        })
        const outcome = await this.participants.promoteParticipation(tx, actor, {
          projectId: batch.projectId,
          form,
          submissionId: submission.id,
          values: verified.values,
          validatedById: batch.reviewedById,
        })
        const finishedAt = new Date()
        await tx.dataImportRow.update({
          where: { id: row.id },
          data: {
            status: 'PROCESSED',
            processedAt: finishedAt,
            processingErrorCode: null,
            processingClaimId: null,
            processingClaimedAt: null,
          },
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: batch.projectId,
            action: 'IMPORT_PARTICIPATION_ROW_COMMITTED',
            entityType: 'DataImportRow',
            entityId: row.id,
            changes: {
              importBatchId: batch.id,
              sourceRowNumber: row.rowNumber,
              participationId: outcome.participationId,
              enrollmentId: outcome.enrollmentId,
              submissionId: submission.id,
            },
          },
        })
      },
      { transactionTimeoutMs: PARTICIPATION_IMPORT_TRANSACTION_TIMEOUT_MS },
    )
  }
  private promoteGenericRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
    validationRevision: number,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', async (tx, actor) => {
      const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
      if (
        batch.status !== 'PROCESSING' ||
        batch.processingClaimId !== claimId ||
        batch.validationRevision !== validationRevision ||
        batch.validatedMappingRevision !== batch.mappingRevision ||
        !batch.reviewedById
      ) {
        throw new ConflictException('The processing claim or validation revision is stale.')
      }
      const row = await tx.dataImportRow.findFirst({
        where: {
          id: rowId,
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          importBatchId: batch.id,
          status: 'PROCESSING',
          processingClaimId: claimId,
          mappingRevision: batch.mappingRevision,
          validationRevision: batch.validationRevision,
        },
        select: { id: true, rowNumber: true, normalizedData: true },
      })
      if (!row) throw new ConflictException('The import row claim is unavailable.')
      const existing = await tx.formSubmission.findUnique({
        where: { importRowId: row.id },
        select: { id: true },
      })
      if (existing) {
        await tx.dataImportRow.update({
          where: { id: row.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            processingClaimId: null,
            processingClaimedAt: null,
            processingErrorCode: null,
          },
        })
        return
      }
      const values = safeRawData(row.normalizedData as Prisma.JsonValue)
      const fields = await tx.formField.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
        },
        select: fieldSelection,
        orderBy: { sequenceNo: 'asc' },
        take: IMPORT_ENGINEERING_LIMITS.maxMappedFields,
      })
      const verified = normalizeImportedRow(fields.map(contract), values)
      if (!verified.valid) throw new ConflictException('The normalized row no longer validates.')
      const submission = await tx.formSubmission.create({
        data: {
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
          formVersion: batch.formVersion,
          clientSubmissionId: row.id,
          importBatchId: batch.id,
          importRowId: row.id,
          submittedById: actor.userId,
          source: 'IMPORTED_DATASET',
          status: 'DRAFT',
        },
        select: { id: true },
      })
      await tx.formResponseValue.createMany({
        data: fields.map((field) => ({
          organizationId: actor.organizationId,
          projectId: batch.projectId,
          formId: batch.formId,
          submissionId: submission.id,
          fieldId: field.id,
          value:
            verified.values[field.code] === null
              ? Prisma.JsonNull
              : (verified.values[field.code] as Prisma.InputJsonValue),
        })),
      })
      const submittedAt = new Date()
      await tx.formSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'VALIDATED',
          submittedAt,
          validatedById: batch.reviewedById,
          validatedAt: submittedAt,
        },
      })
      await tx.dataImportRow.update({
        where: { id: row.id },
        data: {
          status: 'PROCESSED',
          processedAt: submittedAt,
          processingClaimId: null,
          processingClaimedAt: null,
          processingErrorCode: null,
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: batch.projectId,
          action: 'IMPORT_ROW_PROMOTED',
          entityType: 'FormSubmission',
          entityId: submission.id,
          changes: {
            importBatchId: batch.id,
            importRowId: row.id,
            sourceRowNumber: row.rowNumber,
            formVersion: batch.formVersion,
            validationRevision: batch.validationRevision,
          },
        },
      })
    })
  }

  private releaseFailedRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', async (tx, actor) => {
      const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
      const row = await tx.dataImportRow.findFirst({
        where: {
          id: rowId,
          organizationId: actor.organizationId,
          importBatchId: batch.id,
          status: 'PROCESSING',
          processingClaimId: claimId,
        },
        select: { id: true, processingAttempts: true },
      })
      if (!row) return
      await tx.dataImportRow.update({
        where: { id: row.id },
        data: {
          status:
            row.processingAttempts >= IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts
              ? 'FAILED'
              : 'VALID',
          processingClaimId: null,
          processingClaimedAt: null,
          processingErrorCode:
            row.processingAttempts >= IMPORT_ENGINEERING_LIMITS.maxProcessingAttempts
              ? 'RETRY_LIMIT_EXCEEDED'
              : 'RETRY_PENDING',
        },
      })
    })
  }

  private finishClaim(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    claimId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', async (tx, actor) => {
      await this.lockBatch(tx, actor, projectId, batchId)
      const batch = await this.requireBatchWithHeaders(tx, actor, projectId, batchId)
      if (batch.processingClaimId !== claimId) {
        throw new ConflictException('The processing claim changed concurrently.')
      }
      // Reconcile the status, counters, and claim release atomically. While a batch
      // is PROCESSING, the database state contract requires its claim fields to
      // remain populated; clearing them in a separate UPDATE creates a transient
      // invalid row and fails the checkpoint before reconciliation can run.
      await this.reconcileBatch(tx, batch.id)
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          projectId: batch.projectId,
          action: 'IMPORT_PROCESSING_CHECKPOINT',
          entityType: 'DataImportBatch',
          entityId: batch.id,
          changes: { processingRevision: batch.processingRevision },
        },
      })
      return this.mapStoredBatch(tx, actor, batch.projectId, batch.id)
    })
  }

  private async reconcileBatch(tx: Tx, batchId: string) {
    const counts = await tx.dataImportRow.groupBy({
      by: ['status'],
      where: { importBatchId: batchId },
      _count: { _all: true },
    })
    const count = (status: string) =>
      counts.find((entry) => entry.status === status)?._count._all ?? 0
    const processed = count('PROCESSED')
    const unprocessed = count('UNPROCESSED')
    const failed = count('FAILED')
    const invalid = count('INVALID')
    const outstanding = count('VALID') + count('PROCESSING') + count('PENDING')
    const status =
      outstanding > 0
        ? 'PARTIALLY_PROCESSED'
        : invalid + unprocessed + failed > 0
          ? 'PARTIALLY_PROCESSED'
          : 'PROCESSED'
    await tx.dataImportBatch.update({
      where: { id: batchId },
      data: {
        status,
        processedRows: processed,
        unprocessedRows: unprocessed,
        failedRows: failed,
        invalidRows: invalid,
        processingClaimId: null,
        processingClaimedAt: null,
        processedAt: outstanding === 0 ? new Date() : null,
      },
    })
  }

  private async mapStoredBatch(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    batchId: string,
  ) {
    return mapBatch(await this.requireBatch(tx, actor, projectId, batchId))
  }

  private async lockBatch(tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string) {
    if (![projectId, batchId].every((value) => UUID_PATTERN.test(value))) {
      throw new NotFoundException('Import batch unavailable.')
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id::text FROM pathways.data_import_batches
      WHERE id=${batchId.toLowerCase()}::uuid
        AND organization_id=${actor.organizationId}::uuid
        AND project_id=${projectId.toLowerCase()}::uuid
      FOR UPDATE
    `)
    if (rows.length !== 1) throw new NotFoundException('Import batch unavailable.')
  }

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project.id
  }

  private async requireBatch(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    batchId: string,
  ) {
    const scopedProjectId = await this.requireProject(tx, actor, projectId)
    if (!UUID_PATTERN.test(batchId)) throw new NotFoundException('Import batch unavailable.')
    const batch = await tx.dataImportBatch.findFirst({
      where: {
        id: batchId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId: scopedProjectId,
      },
      select: batchSelection,
    })
    if (!batch) throw new NotFoundException('Import batch unavailable.')
    return batch
  }

  private async requireBatchWithHeaders(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    batchId: string,
  ) {
    const batch = await this.requireBatch(tx, actor, projectId, batchId)
    const stored = await tx.dataImportBatch.findUnique({
      where: { id: batch.id },
      select: {
        ...batchSelection,
        sourceHeaders: true,
        storageBucket: true,
        storageObjectKey: true,
        processingClaimId: true,
        processingClaimedAt: true,
      },
    })
    if (!stored) throw new NotFoundException('Import batch unavailable.')
    return stored
  }
}
