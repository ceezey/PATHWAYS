import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'
import { z } from 'zod'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { displayName, personName, uuid } from './finance.helpers'

// Confirms the expense is still the pending, receipt-free revision the uploader loaded.
export async function admitReceiptUpload(
  tx: Tx,
  actor: ApplicationIdentity,
  canonicalProjectId: string,
  canonicalId: string,
  expectedUpdatedAt: string,
) {
  await requireScopedProject(tx, actor, canonicalProjectId)
  const [row] = await tx.$queryRaw<
    Array<{ value: unknown }>
  >`SELECT pathways.p34_own_expense(${canonicalProjectId}::uuid,${canonicalId}::uuid) AS value`
  const value = z
    .object({
      id: uuid,
      projectId: uuid,
      status: z.literal('PENDING'),
      updatedAt: z.string().datetime({ offset: true }),
      receiptEvidenceId: uuid.nullable(),
    })
    .strict()
    .parse(row?.value)
  if (
    value.id !== canonicalId ||
    value.projectId !== canonicalProjectId ||
    value.receiptEvidenceId !== null ||
    new Date(value.updatedAt).getTime() !== Date.parse(expectedUpdatedAt)
  )
    throw new ConflictException('Pending expense changed. Reload before attaching a receipt.')
  return { organizationId: actor.organizationId, userId: actor.userId }
}

// Reads the allowlisted disbursement record fields and audits that the record was generated.
export async function readOfficialReceipt(
  tx: Tx,
  actor: ApplicationIdentity,
  canonicalProjectId: string,
  canonicalId: string,
) {
  await requireScopedProject(tx, actor, canonicalProjectId)
  const expense = await tx.budgetExpenseEntry.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: canonicalProjectId,
      id: canonicalId,
    },
    select: {
      id: true,
      description: true,
      amount: true,
      expenseDate: true,
      status: true,
      receiptEvidenceId: true,
      submittedAt: true,
      verifiedAt: true,
      approvedAt: true,
      submittedBy: personName,
      verifiedBy: personName,
      approvedBy: personName,
      budgetRecord: {
        select: {
          category: true,
          currency: true,
          plannedBudget: true,
          activity: { select: { code: true, title: true } },
        },
      },
      project: { select: { code: true, title: true } },
      organization: { select: { name: true } },
    },
  })
  if (!expense) throw new NotFoundException('Expense unavailable.')
  // Proof metadata only; the bytes stay on the private receipt download path.
  const proof = expense.receiptEvidenceId
    ? await tx.evidenceMedia.findFirst({
        where: {
          organizationId: actor.organizationId,
          projectId: canonicalProjectId,
          expenseId: canonicalId,
          storageReady: true,
        },
        select: { fileName: true, sha256: true, byteSize: true },
      })
    : null
  const [signoff] = await tx.$queryRaw<
    Array<{ signedOffAt: Date; fullName: string }>
  >`SELECT s.signed_off_at AS "signedOffAt",u.full_name AS "fullName" FROM pathways.expense_signoffs s JOIN pathways.system_users u ON u.organization_id=s.organization_id AND u.id=s.signed_off_by_id WHERE s.organization_id=${actor.organizationId}::uuid AND s.project_id=${canonicalProjectId}::uuid AND s.expense_id=${canonicalId}::uuid`
  await writeAuditLog(tx, actor, {
    projectId: canonicalProjectId,
    action: 'EXPENSE_RECEIPT_GENERATED',
    entityType: 'BudgetExpenseEntry',
    entityId: canonicalId,
  })
  const activity = expense.budgetRecord.activity
  return {
    receiptNo: `DR-${canonicalId.slice(0, 8).toUpperCase()}`,
    issuedAt: new Date().toISOString(),
    organization: expense.organization.name.slice(0, 200),
    project: { code: expense.project.code, title: expense.project.title },
    activity: activity ? { code: activity.code, title: activity.title } : null,
    budgetLine: expense.budgetRecord.category,
    allocated: expense.budgetRecord.plannedBudget.toFixed(2),
    expense: {
      description: expense.description,
      amount: expense.amount.toFixed(2),
      currency: expense.budgetRecord.currency,
      date: expense.expenseDate.toISOString().slice(0, 10),
      status: expense.status,
    },
    people: {
      submitted: {
        name: displayName(expense.submittedBy),
        at: expense.submittedAt?.toISOString() ?? null,
      },
      verified: {
        name: displayName(expense.verifiedBy),
        at: expense.verifiedAt?.toISOString() ?? null,
      },
      approved: {
        name: displayName(expense.approvedBy),
        at: expense.approvedAt?.toISOString() ?? null,
      },
      signedOff: {
        name: signoff ? signoff.fullName.slice(0, 200) : null,
        at: signoff?.signedOffAt.toISOString() ?? null,
      },
    },
    attachment: proof
      ? {
          fileName: proof.fileName,
          sha256: proof.sha256,
          byteSize: proof.byteSize.toString(),
        }
      : null,
  }
}

// Admits a receipt download: current evidence grant, scoped project and a private, ready proof.
export async function admitReceiptRead(
  tx: Tx,
  actor: ApplicationIdentity,
  canonicalProjectId: string,
  canonicalId: string,
) {
  if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'evidence.read'))
    throw new ForbiddenException('Current financial evidence permission required.')
  await requireScopedProject(tx, actor, canonicalProjectId)
  const expense = await tx.budgetExpenseEntry.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: canonicalProjectId,
      id: canonicalId,
    },
    select: { receiptEvidenceId: true, updatedAt: true },
  })
  if (!expense?.receiptEvidenceId) throw new NotFoundException('Receipt unavailable.')
  const proof = await tx.evidenceMedia.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: canonicalProjectId,
      id: expense.receiptEvidenceId,
      expenseId: canonicalId,
      activityUpdateId: null,
      enrollmentId: null,
      sourceSubmissionId: null,
      publicVisibilityStatus: 'PRIVATE',
      storageReady: true,
    },
    select: {
      id: true,
      bucket: true,
      objectKey: true,
      sha256: true,
      byteSize: true,
      contentType: true,
      updatedAt: true,
    },
  })
  if (
    !proof ||
    proof.bucket !== 'pathways-private' ||
    !proof.objectKey ||
    !proof.sha256 ||
    proof.byteSize === null ||
    !proof.contentType ||
    !['application/pdf', 'image/png', 'image/jpeg'].includes(proof.contentType)
  )
    throw new NotFoundException('Receipt unavailable.')
  return { organizationId: actor.organizationId, expense, proof }
}
