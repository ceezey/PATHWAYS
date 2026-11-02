import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import {
  IMPORT_ENGINEERING_LIMITS,
  ImportParseError,
  detectFileParts,
  parseSecureImport,
  registrationRange,
  selectPartColumns,
} from '@pathways/imports/server'
import type {
  AutomaticImportMappingRequest,
  FilePart,
  ImportRowsQuery,
  ProcessImportRequest,
  RerunImportRequest,
  SaveImportMappingRequest,
  UploadImportRequest,
  ValidateImportRequest,
} from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { prismaDiagnosticCode } from '../../prisma/transaction-diagnostic'
import { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import { ParticipantsService } from '../participants/participants.service'
import { StorageService } from '../storage/storage.service'
import { recordAutomaticMapping } from './automatic-mapping.service'
import { listProjectBatches, readBatchDetail, readBatchRows } from './import-batches.service'
import {
  type ProcessingClaim,
  claimBatchRows,
  finishBatchClaim,
  releaseClaimedRow,
} from './import-claims.service'
import { saveBatchMapping } from './import-mapping.service'
import { holdsScores, partImportId, readPartStart } from './import-parts.service'
import type {
  PromotionContext,
  PromotionHandlers,
  PromotionKind,
} from './import-promotion-context.service'
import {
  promoteChunkRows,
  promoteClaimedGenericRow,
  promoteClaimedParticipationRow,
  promoteClaimedRegistrationRow,
  promoteClaimedStageRow,
} from './import-promotion.service'
import { readRerunSource, recordRerun } from './import-rerun.service'
import {
  readUploadRecovery,
  recordUploadFailure,
  recordUploadRecoveryRequired,
  reserveBatchUpload,
  stageUploadedRows,
} from './import-upload.service'
import { validateBatchRows } from './import-validation.service'
import { type UploadedImportFile, checksum, fileContentType, fileMetadata } from './imports.helpers'
import { W10FinalizationFault } from './upload-finalization-fault'

export type { UploadedImportFile } from './imports.helpers'

// The parent batch a part is staged under, and the part's columns.
interface StartedPart {
  parentBatchId: string
  part: FilePart
}

const REGISTRATION_IMPORT_TRANSACTION_TIMEOUT_MS = 20_000
const PARTICIPATION_IMPORT_TRANSACTION_TIMEOUT_MS = 20_000
// One chunk promotes at most processingCheckpointRows rows. The verified-transaction
// ceiling is 30 seconds; a 25-row registration chunk stays well inside it.
const PROMOTION_CHUNK_TRANSACTION_TIMEOUT_MS = 30_000
const STAGED_ROWS_TRANSACTION_TIMEOUT_MS = 30_000

// Import batch routes; each step runs in one authorized transaction whose tx the import modules take.
@Injectable()
export class ImportsService {
  private readonly w10FinalizationFault = new W10FinalizationFault()
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(BeneficiaryRegistrationService)
    private readonly registration: BeneficiaryRegistrationService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  // The domain services a row promotion calls, read when a transaction starts.
  private get promotion(): PromotionHandlers {
    return { registration: this.registration, participants: this.participants }
  }

  listBatches(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', (tx, actor) =>
      listProjectBatches(tx, actor, projectId),
    )
  }

  getBatch(identity: ApplicationIdentity, projectId: string, batchId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', (tx, actor) =>
      readBatchDetail(tx, actor, projectId, batchId),
    )
  }

  automaticMapping(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: AutomaticImportMappingRequest,
  ) {
    if (
      !UUID_PATTERN.test(projectId) ||
      !UUID_PATTERN.test(batchId) ||
      !input ||
      Object.keys(input).length !== 1 ||
      !Object.hasOwn(input, 'expectedMappingRevision') ||
      (input.expectedMappingRevision !== 0 && input.expectedMappingRevision !== 1)
    ) {
      throw new BadRequestException('Invalid automatic mapping request.')
    }
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      recordAutomaticMapping(tx, actor, projectId, batchId, input),
    )
  }

  listRows(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    query: ImportRowsQuery,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', (tx, actor) =>
      readBatchRows(tx, actor, projectId, batchId, query),
    )
  }

  async upload(
    identity: ApplicationIdentity,
    projectId: string,
    input: UploadImportRequest,
    file?: UploadedImportFile,
    part?: StartedPart,
  ) {
    if (!file) throw new BadRequestException('A source file is required.')
    const metadata = fileMetadata(file)
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Private upload storage is not configured.')
    }
    const reservation = await this.reserveUpload(identity, projectId, input, metadata, part)
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
      parsed = await parseSecureImport(file.buffer, metadata.type, {}, reservation.sourceSheetName)
    } catch (error) {
      const failureCode =
        error instanceof ImportParseError ? error.code.slice(0, 64) : 'PARSER_REJECTED_INPUT'
      await this.markUploadFailure(
        identity,
        projectId,
        reservation.batchId,
        failureCode,
        stored,
        error instanceof ImportParseError ? error.message : undefined,
      )
      if (error instanceof ImportParseError) {
        throw new BadRequestException({ message: error.message, code: error.code })
      }
      throw new BadRequestException('The source file could not be parsed safely.')
    }

    try {
      return await this.finalizeUpload(identity, projectId, reservation.batchId, parsed, part?.part)
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

  /** Copies the stored source of a staged batch into a new batch on a newer published form version. */
  async rerun(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: RerunImportRequest,
  ) {
    const source = await withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.upload',
      (tx, actor) => readRerunSource(tx, actor, projectId, batchId, input.formId),
    )
    const buffer = await this.readStoredSource(source)
    const formId = input.formId.toLowerCase()
    const created = await this.upload(
      identity,
      projectId,
      {
        formId,
        clientImportId: source.clientImportId,
        ...(source.sourceSheetName ? { sheetName: source.sourceSheetName } : {}),
      },
      {
        buffer,
        originalname: source.originalFileName,
        mimetype: fileContentType(source.fileType),
        size: buffer.length,
      },
    )
    if (created.status === 'FAILED') throw new ConflictException('The re-run failed. Retry it.')
    await withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      recordRerun(tx, actor, created.projectId, batchId, created.id, source.formVersion),
    )
    return created
  }

  /** Copies the stored file of a parent batch into a child batch of one part, on the part's published form. */
  async startFilePart(
    identity: ApplicationIdentity,
    projectId: string,
    parentId: string,
    partCode: string,
  ) {
    const source = await withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.upload',
      (tx, actor) => readPartStart(tx, actor, projectId, parentId, partCode),
    )
    const buffer = await this.readStoredSource(source)
    // Scores with no answer key to check them against would be imported unchecked, so stop before staging.
    const parsed = await parseSecureImport(buffer, source.fileType, {}, source.sourceSheetName)
    if (!source.answerKey && holdsScores(selectPartColumns(parsed, source.part))) {
      throw new ConflictException("Mark the correct answers for this survey's total score first.")
    }
    const start = () =>
      this.upload(
        identity,
        projectId,
        {
          formId: source.formId,
          clientImportId: partImportId(
            source.clientImportId,
            partCode,
            source.formVersion,
            source.attempt,
          ),
          ...(source.sourceSheetName ? { sheetName: source.sourceSheetName } : {}),
        },
        {
          buffer,
          originalname: source.originalFileName,
          mimetype: fileContentType(source.fileType),
          size: buffer.length,
        },
        { parentBatchId: source.parentId, part: source.part },
      )
    try {
      return await start()
    } catch (error) {
      // Two people pressing Start race on the part's unique key; the second takes the child the first made.
      if (!(error instanceof ConflictException) && prismaDiagnosticCode(error) !== 'P2002')
        throw error
      return start()
    }
  }

  async resumeUpload(identity: ApplicationIdentity, projectId: string, batchId: string) {
    const reservation = await withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.upload',
      (tx, actor) => readUploadRecovery(tx, actor, projectId, batchId),
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
    const parsed = await parseSecureImport(
      source,
      reservation.fileType,
      {},
      reservation.sourceSheetName,
    )
    return this.finalizeUpload(identity, projectId, batchId, parsed, reservation.part)
  }

  saveMapping(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: SaveImportMappingRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.review', (tx, actor) =>
      saveBatchMapping(tx, actor, projectId, batchId, input),
    )
  }

  validate(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ValidateImportRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.validate', (tx, actor) =>
      validateBatchRows(tx, actor, projectId, batchId, input),
    )
  }

  async process(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ProcessImportRequest,
  ) {
    const claim = await this.claimRows(identity, projectId, batchId, input)
    if (claim.complete) return this.getBatch(identity, projectId, batchId)
    const kind: PromotionKind = claim.stageHandler
      ? 'STAGE'
      : claim.registrationHandler
        ? 'REGISTRATION'
        : claim.participationHandler
          ? 'PARTICIPATION'
          : 'GENERIC'
    const chunkSize = IMPORT_ENGINEERING_LIMITS.processingCheckpointRows
    for (let offset = 0; offset < claim.rowIds.length; offset += chunkSize) {
      const chunk = claim.rowIds.slice(offset, offset + chunkSize)
      if (claim.context) {
        try {
          await this.promoteChunk(
            identity,
            projectId,
            claim.claimId,
            input.expectedValidationRevision,
            kind,
            claim.context,
            chunk,
          )
          continue
        } catch {
          // The chunk rolled back as a unit. Rerun its rows on the single-row path,
          // which keeps the per-row release, retry and ForbiddenException behaviour.
        }
      }
      await this.promoteRowsIndividually(identity, projectId, batchId, claim, chunk, input)
    }
    return this.finishClaim(identity, projectId, batchId, claim.claimId)
  }

  private async promoteRowsIndividually(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    claim: ProcessingClaim,
    rowIds: string[],
    input: ProcessImportRequest,
  ) {
    for (const rowId of rowIds) {
      try {
        if (claim.stageHandler) {
          await this.promoteStageRow(
            identity,
            projectId,
            batchId,
            rowId,
            claim.claimId,
            input.expectedValidationRevision,
          )
        } else if (claim.registrationHandler) {
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
  }

  private promoteChunk(
    identity: ApplicationIdentity,
    projectId: string,
    claimId: string,
    validationRevision: number,
    kind: PromotionKind,
    context: PromotionContext,
    rowIds: string[],
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.process',
      (tx, actor) =>
        promoteChunkRows(
          tx,
          actor,
          this.promotion,
          projectId,
          claimId,
          validationRevision,
          kind,
          context,
          rowIds,
        ),
      { transactionTimeoutMs: PROMOTION_CHUNK_TRANSACTION_TIMEOUT_MS },
    )
  }

  // The stored source of a batch, checked against the checksum its reservation recorded.
  private async readStoredSource(source: {
    storageBucket: string
    storageObjectKey: string
    sourceChecksum: string
  }) {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Private upload storage is not configured.')
    }
    let buffer: Buffer
    try {
      buffer = await this.storage.downloadPrivateFile(source.storageBucket, source.storageObjectKey)
    } catch {
      throw new ServiceUnavailableException('The private source object is unavailable.')
    }
    if (checksum(buffer) !== source.sourceChecksum) {
      throw new ConflictException('The stored source checksum does not match its reservation.')
    }
    return buffer
  }

  private reserveUpload(
    identity: ApplicationIdentity,
    projectId: string,
    input: UploadImportRequest,
    metadata: ReturnType<typeof fileMetadata>,
    part?: StartedPart,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      reserveBatchUpload(
        tx,
        actor,
        projectId,
        input,
        metadata,
        this.env.UPLOADS_BUCKET,
        part && { parentBatchId: part.parentBatchId, partCode: part.part.code },
      ),
    )
  }

  private finalizeUpload(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    whole: Awaited<ReturnType<typeof parseSecureImport>>,
    part?: FilePart,
  ) {
    // A part's batch stages only its own columns; a file with survey stages stages only its registration columns and keeps the stages as parts.
    const fileParts = part ? [] : detectFileParts(whole)
    const parsed = part
      ? selectPartColumns(whole, part)
      : fileParts.length
        ? selectPartColumns(whole, registrationRange(fileParts))
        : whole
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.upload',
      (tx, actor) =>
        stageUploadedRows(
          tx,
          actor,
          projectId,
          batchId,
          parsed,
          this.w10FinalizationFault,
          fileParts,
        ),
      { transactionTimeoutMs: STAGED_ROWS_TRANSACTION_TIMEOUT_MS },
    )
  }

  private markUploadFailure(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    failureCode: string,
    stored = false,
    failureMessage?: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      recordUploadFailure(tx, actor, projectId, batchId, failureCode, stored, failureMessage),
    )
  }

  private markRecoveryRequired(identity: ApplicationIdentity, projectId: string, batchId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      recordUploadRecoveryRequired(tx, actor, projectId, batchId),
    ).catch(() => false)
  }

  private claimRows(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ProcessImportRequest,
  ): Promise<ProcessingClaim> {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      claimBatchRows(tx, actor, this.promotion, projectId, batchId, input),
    )
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
      (tx, actor) =>
        promoteClaimedRegistrationRow(
          tx,
          actor,
          this.promotion,
          projectId,
          batchId,
          rowId,
          claimId,
          validationRevision,
        ),
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
      (tx, actor) =>
        promoteClaimedParticipationRow(
          tx,
          actor,
          this.promotion,
          projectId,
          batchId,
          rowId,
          claimId,
          validationRevision,
        ),
      { transactionTimeoutMs: PARTICIPATION_IMPORT_TRANSACTION_TIMEOUT_MS },
    )
  }

  private promoteStageRow(
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
      (tx, actor) =>
        promoteClaimedStageRow(
          tx,
          actor,
          this.promotion,
          projectId,
          batchId,
          rowId,
          claimId,
          validationRevision,
        ),
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
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      promoteClaimedGenericRow(tx, actor, projectId, batchId, rowId, claimId, validationRevision),
    )
  }

  private releaseFailedRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      releaseClaimedRow(tx, actor, projectId, batchId, rowId, claimId),
    )
  }

  private finishClaim(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    claimId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      finishBatchClaim(tx, actor, projectId, batchId, claimId),
    )
  }
}
