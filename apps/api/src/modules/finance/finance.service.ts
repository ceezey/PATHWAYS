import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import {
  type BudgetResponse,
  type BudgetWriteResponse,
  type ExpenseResponse,
  type ExpenseSignoffResponse,
  createBudgetRequest,
  hasAtomicPermission,
  replaceBudgetRequest,
  reviewExpenseRequest,
  submitExpenseRequest,
  uploadExpenseReceiptRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
import { StorageService } from '../storage/storage.service'
import {
  admitReceiptRead,
  admitReceiptUpload,
  readOfficialReceipt,
} from './expense-receipts.service'
import { displayName, personName, uuid } from './finance.helpers'
import { ReceiptPdfError, ReceiptPdfRenderer } from './receipt-pdf.renderer'

@Injectable()
export class FinanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ReceiptPdfRenderer) private readonly receipts: ReceiptPdfRenderer,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}
  budgets(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'budgets.read', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const rows = await tx.projectBudgetRecord.findMany({
        where: { organizationId: actor.organizationId, projectId, archivedAt: null },
        select: {
          id: true,
          activityId: true,
          category: true,
          currency: true,
          plannedBudget: true,
          remarks: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
        take: 101,
      })
      if (rows.length > 100) throw new BadRequestException('Select a smaller budget scope.')
      return rows.map(
        (row): BudgetResponse => ({
          ...row,
          plannedBudget: row.plannedBudget.toFixed(2),
          updatedAt: row.updatedAt.toISOString(),
        }),
      )
    })
  }
  createBudget(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = createBudgetRequest.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid budget record.')
    return withAuthorizedOperation(this.prisma, identity, 'budgets.create', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const row = await tx.projectBudgetRecord.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          ...parsed.data,
          currency: 'PHP',
          recordedById: actor.userId,
        },
        select: { id: true, updatedAt: true },
      })
      await writeAuditLog(tx, actor, {
        projectId,
        action: 'BUDGET_CREATED',
        entityType: 'ProjectBudgetRecord',
        entityId: row.id,
      })
      return { id: row.id, updatedAt: row.updatedAt.toISOString() } satisfies BudgetWriteResponse
    })
  }
  replaceBudget(identity: ApplicationIdentity, projectId: string, id: string, input: unknown) {
    const parsed = replaceBudgetRequest.safeParse(input)
    if (!parsed.success || !uuid.safeParse(id).success)
      throw new BadRequestException('Invalid budget replacement.')
    return withAuthorizedOperation(this.prisma, identity, 'budgets.update', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const previous = await tx.projectBudgetRecord.findFirst({
        where: { organizationId: actor.organizationId, projectId, id, archivedAt: null },
        select: { id: true, updatedAt: true },
      })
      if (
        !previous ||
        previous.updatedAt.toISOString() !== new Date(parsed.data.expectedUpdatedAt).toISOString()
      )
        throw new ConflictException('Budget changed. Reload before replacing it.')
      const { expectedUpdatedAt: _, ...body } = parsed.data
      const archived = await tx.projectBudgetRecord.updateMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          id,
          archivedAt: null,
          updatedAt: previous.updatedAt,
        },
        data: { archivedAt: new Date() },
      })
      if (archived.count !== 1) throw new ConflictException('Budget changed.')
      const row = await tx.projectBudgetRecord.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          ...body,
          currency: 'PHP',
          recordedById: actor.userId,
        },
        select: { id: true, updatedAt: true },
      })
      await writeAuditLog(tx, actor, {
        projectId,
        action: 'BUDGET_REPLACED',
        entityType: 'ProjectBudgetRecord',
        entityId: row.id,
        changes: { previousId: id },
      })
      return { id: row.id, updatedAt: row.updatedAt.toISOString() } satisfies BudgetWriteResponse
    })
  }
  expenses(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'expenses.read', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const rows = await tx.budgetExpenseEntry.findMany({
        where: { organizationId: actor.organizationId, projectId },
        select: {
          id: true,
          budgetRecordId: true,
          description: true,
          amount: true,
          expenseDate: true,
          status: true,
          receiptEvidenceId: true,
          submittedById: true,
          verifiedById: true,
          approvedById: true,
          updatedAt: true,
          submittedBy: personName,
          verifiedBy: personName,
          approvedBy: personName,
        },
        orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }],
        take: 101,
      })
      if (rows.length > 100) throw new BadRequestException('Select a smaller expense scope.')
      const signoffs = await tx.$queryRaw<
        Array<{ expenseId: string; signedOffById: string; signedOffAt: Date; fullName: string }>
      >`SELECT s.expense_id::text AS "expenseId",s.signed_off_by_id::text AS "signedOffById",s.signed_off_at AS "signedOffAt",u.full_name AS "fullName" FROM pathways.expense_signoffs s JOIN pathways.system_users u ON u.organization_id=s.organization_id AND u.id=s.signed_off_by_id WHERE s.organization_id=${actor.organizationId}::uuid AND s.project_id=${projectId}::uuid`
      return rows.map(({ submittedBy, verifiedBy, approvedBy, ...row }): ExpenseResponse => {
        const signoff = signoffs.find((value) => value.expenseId === row.id)
        return {
          ...row,
          amount: row.amount.toFixed(2),
          expenseDate: row.expenseDate.toISOString().slice(0, 10),
          updatedAt: row.updatedAt.toISOString(),
          // Reviewer names, so the ledger names people instead of printing their ids.
          submittedByName: displayName(submittedBy),
          verifiedByName: displayName(verifiedBy),
          approvedByName: displayName(approvedBy),
          signedOffById: signoff?.signedOffById ?? null,
          signedOffAt: signoff?.signedOffAt.toISOString() ?? null,
          signedOffByName: signoff ? signoff.fullName.slice(0, 200) : null,
        }
      })
    })
  }
  references(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'expenses.submit', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const [row] = await tx.$queryRaw<
        Array<{ value: unknown }>
      >`SELECT pathways.p34_expense_budget_references(${projectId}::uuid) AS value`
      return row?.value
    })
  }
  submit(identity: ApplicationIdentity, projectId: string, input: unknown) {
    const parsed = submitExpenseRequest.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid expense submission.')
    const body = parsed.data
    return withAuthorizedOperation(this.prisma, identity, 'expenses.submit', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const [row] = await tx.$queryRaw<
        Array<{ value: unknown }>
      >`SELECT pathways.p34_submit_expense(${projectId}::uuid,${body.clientRequestId}::uuid,${body.budgetRecordId}::uuid,${body.description},${body.amount}::numeric,${body.expenseDate}::date) AS value`
      return row?.value
    })
  }
  review(identity: ApplicationIdentity, projectId: string, id: string, input: unknown) {
    const parsed = reviewExpenseRequest.safeParse(input)
    if (!parsed.success || !uuid.safeParse(id).success)
      throw new BadRequestException('Invalid expense review.')
    const body = parsed.data
    return withAuthorizedOperation(
      this.prisma,
      identity,
      body.stage === 'VERIFY' ? 'expenses.verify' : 'expenses.approve',
      async (tx, actor) => {
        await requireScopedProject(tx, actor, projectId)
        const [row] = await tx.$queryRaw<
          Array<{ value: unknown }>
        >`SELECT pathways.p34_review_expense(${projectId}::uuid,${id}::uuid,${new Date(body.expectedUpdatedAt)},${body.decision},${body.reason ?? null}) AS value`
        return row?.value
      },
    )
  }
  async uploadReceipt(
    identity: ApplicationIdentity,
    projectId: string,
    id: string,
    input: unknown,
    file: { buffer: Buffer; size: number; mimetype: string } | undefined,
  ) {
    const parsed = uploadExpenseReceiptRequest.safeParse(input)
    if (
      !parsed.success ||
      !uuid.safeParse(id).success ||
      !file ||
      !Buffer.isBuffer(file.buffer) ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      file.size > 10485760
    )
      throw new BadRequestException('Invalid private receipt upload.')
    const canonicalProjectId = projectId.toLowerCase()
    const canonicalId = id.toLowerCase()
    const bytes = file.buffer
    const mime =
      bytes.subarray(0, 5).toString('ascii') === '%PDF-'
        ? 'application/pdf'
        : bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
          ? 'image/png'
          : bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
            ? 'image/jpeg'
            : null
    if (!mime || mime !== file.mimetype)
      throw new BadRequestException('Receipt content does not match its supported format.')
    const initial = await withAuthorizedOperation(
      this.prisma,
      identity,
      'expenses.evidence.submit',
      async (tx, actor) => {
        return admitReceiptUpload(
          tx,
          actor,
          canonicalProjectId,
          canonicalId,
          parsed.data.expectedUpdatedAt,
        )
      },
    )
    const evidenceId = randomUUID()
    const extension = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg'
    const name = `receipt.${extension}`
    const key = `organizations/${initial.organizationId}/projects/${canonicalProjectId}/evidence/${evidenceId}/${name}`
    const sha = createHash('sha256').update(bytes).digest('hex')
    let uploaded = false
    let finalizationAttempted = false
    try {
      try {
        await this.storage.uploadPrivateFile('pathways-private', key, bytes, mime)
      } catch {
        // Provider errors are not diagnostics; an outage is unavailable, never a 500.
        throw new ServiceUnavailableException('Private receipt storage unavailable.')
      }
      uploaded = true
      const env = readApiEnv(process.env)
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
        throw new ServiceUnavailableException('Private receipt storage unavailable.')
      try {
        const read = this.storageFactories.createPrivateInspectionReader({
          serviceOrigin: env.SUPABASE_URL,
          serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
          evidenceBucket: 'pathways-private',
        })
        await read({
          organizationId: initial.organizationId,
          projectId: canonicalProjectId,
          evidenceId,
          bucket: 'pathways-private',
          objectKey: key,
          expectedBytes: bytes.length,
          expectedSha256: sha,
          signal: AbortSignal.timeout(10000),
          deadlineMonotonicMs: performance.now() + 10000,
        })
      } catch {
        throw new ServiceUnavailableException('Private receipt storage unavailable.')
      }
      finalizationAttempted = true
      return await withAuthorizedOperation(
        this.prisma,
        identity,
        'expenses.evidence.submit',
        async (tx, actor) => {
          await requireScopedProject(tx, actor, canonicalProjectId)
          if (actor.organizationId !== initial.organizationId || actor.userId !== initial.userId)
            throw new ForbiddenException('Receipt ownership changed.')
          const [row] = await tx.$queryRaw<
            Array<{ value: unknown }>
          >`SELECT pathways.p34_finalize_expense_receipt(${canonicalProjectId}::uuid,${canonicalId}::uuid,${new Date(parsed.data.expectedUpdatedAt)},${evidenceId}::uuid,${name},${key},${sha},${bytes.length}::bigint,${mime}) AS value`
          return row?.value
        },
      )
    } catch (error) {
      if (uploaded && !finalizationAttempted)
        await this.storage.deleteFile('pathways-private', key).catch(() => undefined)
      if (uploaded && finalizationAttempted)
        new Logger('EXPENSE_RECEIPT_RECOVERY_REQUIRED').warn({
          event: 'EXPENSE_RECEIPT_RECOVERY_REQUIRED',
          allocatedId: evidenceId,
        })
      throw error
    }
  }
  /** Designed disbursement record built from the expense, its budget line and its attached proof. */
  async officialReceipt(identity: ApplicationIdentity, projectId: string, id: string) {
    if (!uuid.safeParse(id).success) throw new NotFoundException('Expense unavailable.')
    const canonicalProjectId = projectId.toLowerCase()
    const canonicalId = id.toLowerCase()
    const snapshot = await withAuthorizedOperation(
      this.prisma,
      identity,
      'expenses.read',
      async (tx, actor) => {
        return readOfficialReceipt(tx, actor, canonicalProjectId, canonicalId)
      },
    )
    let bytes: Buffer
    try {
      bytes = await this.receipts.render(canonicalId, snapshot)
    } catch (error) {
      // The caller gets an outage; the failing stage is logged so a misconfigured
      // renderer (no WEB_ORIGIN, no PDF_CHROME_PATH off Linux) is diagnosable.
      const stage = error instanceof ReceiptPdfError ? error.stage : 'unknown'
      const cause = error instanceof ReceiptPdfError ? error.causeName : 'Error'
      new Logger(FinanceService.name).warn(
        `Receipt document unavailable for expense ${canonicalId} at ${stage} (${cause}).`,
      )
      throw new ServiceUnavailableException('Receipt document temporarily unavailable.')
    }
    return { bytes, fileName: `disbursement-receipt-${snapshot.receiptNo}.pdf` }
  }
  async receipt(identity: ApplicationIdentity, projectId: string, id: string) {
    if (!uuid.safeParse(id).success) throw new NotFoundException('Receipt unavailable.')
    const canonicalProjectId = projectId.toLowerCase()
    const canonicalId = id.toLowerCase()
    const admit = () =>
      withAuthorizedOperation(this.prisma, identity, 'expenses.read', async (tx, actor) => {
        return admitReceiptRead(tx, actor, canonicalProjectId, canonicalId)
      })
    const initial = await admit()
    const env = readApiEnv(process.env)
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new ServiceUnavailableException('Private receipt storage unavailable.')
    const proof = initial.proof
    let bytes: Buffer
    try {
      const read = this.storageFactories.createPrivateInspectionReader({
        serviceOrigin: env.SUPABASE_URL,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        evidenceBucket: 'pathways-private',
      })
      bytes = await read({
        organizationId: initial.organizationId,
        projectId: canonicalProjectId,
        evidenceId: proof.id,
        bucket: 'pathways-private',
        objectKey: proof.objectKey,
        expectedSha256: proof.sha256,
        expectedBytes: Number(proof.byteSize),
        signal: AbortSignal.timeout(10000),
        deadlineMonotonicMs: performance.now() + 10000,
      })
    } catch {
      throw new ServiceUnavailableException('Private receipt storage unavailable.')
    }
    // Repeat current purpose and immutable object admission after network transfer; audit before bytes leave.
    await withAuthorizedOperation(this.prisma, identity, 'expenses.read', async (tx, actor) => {
      if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'evidence.read'))
        throw new ForbiddenException('Current financial evidence permission required.')
      await requireScopedProject(tx, actor, canonicalProjectId)
      const [row] = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT e.id::text FROM pathways.budget_expense_entries e JOIN pathways.evidence_media p ON p.organization_id=e.organization_id AND p.project_id=e.project_id AND p.id=e.receipt_evidence_id WHERE e.organization_id=${actor.organizationId}::uuid AND e.project_id=${canonicalProjectId}::uuid AND e.id=${canonicalId}::uuid AND e.updated_at=${initial.expense.updatedAt} AND p.id=${proof.id}::uuid AND p.updated_at=${proof.updatedAt} AND p.expense_id=e.id AND p.activity_update_id IS NULL AND p.enrollment_id IS NULL AND p.source_submission_id IS NULL AND p.public_visibility_status='PRIVATE' AND p.storage_ready AND p.object_key=${proof.objectKey} AND p.sha256=${proof.sha256} AND p.byte_size=${proof.byteSize}`
      if (!row) throw new NotFoundException('Receipt changed or access unavailable.')
      await writeAuditLog(tx, actor, {
        projectId: canonicalProjectId,
        action: 'EXPENSE_RECEIPT_READ',
        entityType: 'BudgetExpenseEntry',
        entityId: canonicalId,
      })
    })
    return {
      bytes,
      contentType: proof.contentType,
      fileName: `receipt-${proof.id}.${proof.contentType === 'application/pdf' ? 'pdf' : proof.contentType === 'image/png' ? 'png' : 'jpg'}`,
    }
  }
  signoff(identity: ApplicationIdentity, projectId: string, id: string) {
    if (!uuid.safeParse(id).success) throw new NotFoundException('Expense unavailable.')
    return withAuthorizedOperation(this.prisma, identity, 'expenses.signoff', async (tx, actor) => {
      await requireScopedProject(tx, actor, projectId)
      const [row] = await tx.$queryRaw<
        Array<{ expenseId: string; signedOffById: string; signedOffAt: Date }>
      >`INSERT INTO pathways.expense_signoffs(organization_id,project_id,expense_id,signed_off_by_id) VALUES(${actor.organizationId}::uuid,${projectId}::uuid,${id}::uuid,${actor.userId}::uuid) RETURNING expense_id::text AS "expenseId",signed_off_by_id::text AS "signedOffById",signed_off_at AS "signedOffAt"`
      if (!row) throw new ConflictException('Expense signoff unavailable.')
      await writeAuditLog(tx, actor, {
        projectId,
        action: 'EXPENSE_SIGNED_OFF',
        entityType: 'BudgetExpenseEntry',
        entityId: id,
      })
      return { ...row, signedOffAt: row.signedOffAt.toISOString() } satisfies ExpenseSignoffResponse
    })
  }
}
