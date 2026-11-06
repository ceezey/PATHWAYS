import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { projectScope } from '../../common/authz/project-scope'
import type { Tx } from '../../common/prisma/transaction'
import { rows } from './role-overview.helpers'

/** Form drafts waiting to be published; the viewer's own edits need another publisher. */
export async function formDrafts(tx: Tx, actor: ApplicationIdentity) {
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    status: 'DRAFT' as const,
    archivedAt: null,
  }
  const [count, found] = await Promise.all([
    tx.digitalForm.count({ where }),
    tx.digitalForm.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        code: true,
        name: true,
        version: true,
        createdById: true,
        lastEditedById: true,
        updatedAt: true,
        project: { select: { title: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((f) => ({
      formId: f.id,
      projectId: f.projectId,
      projectTitle: f.project.title,
      code: f.code,
      name: f.name.slice(0, 200),
      version: f.version,
      updatedAt: f.updatedAt.toISOString(),
      ownEdit: f.createdById === actor.userId || f.lastEditedById === actor.userId,
    })),
  }
}

/** Public dashboard revisions waiting to be approved or published. */
export async function publicationQueue(tx: Tx, actor: ApplicationIdentity) {
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    state: { in: ['FOR_REVIEW', 'APPROVED'] },
  }
  const [count, found] = await Promise.all([
    tx.projectPublication.count({ where }),
    tx.projectPublication.findMany({
      where,
      select: {
        projectId: true,
        state: true,
        submittedById: true,
        submittedAt: true,
        project: { select: { title: true } },
        submittedBy: { select: { fullName: true } },
      },
      orderBy: [{ submittedAt: 'asc' }, { projectId: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((p) => ({
      projectId: p.projectId,
      projectTitle: p.project.title,
      state: p.state as 'FOR_REVIEW' | 'APPROVED',
      submittedByName: p.submittedBy.fullName,
      submittedAt: p.submittedAt.toISOString(),
      // Only approval refuses the submitter; publishing an approved revision does not.
      ownSubmission: p.state === 'FOR_REVIEW' && p.submittedById === actor.userId,
    })),
  }
}

/** Import batches that failed, need recovery or are validated and waiting to be processed. */
export async function importAttention(tx: Tx, actor: ApplicationIdentity) {
  // Child batches are included because a multi-part file fails or waits per part.
  const where = {
    organizationId: actor.organizationId,
    project: projectScope(actor),
    status: { in: ['FAILED' as const, 'RECOVERY_REQUIRED' as const, 'VALIDATED' as const] },
  }
  const [count, found] = await Promise.all([
    tx.dataImportBatch.count({ where }),
    tx.dataImportBatch.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        originalFileName: true,
        partCode: true,
        status: true,
        uploadedAt: true,
        project: { select: { title: true } },
      },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((b) => ({
      batchId: b.id,
      projectId: b.projectId,
      projectTitle: b.project.title,
      fileName: b.originalFileName.slice(0, 255),
      partCode: b.partCode?.slice(0, 64) ?? null,
      status: b.status as 'FAILED' | 'RECOVERY_REQUIRED' | 'VALIDATED',
      uploadedAt: b.uploadedAt.toISOString(),
    })),
  }
}

/** Alert rule drafts waiting to be activated. */
export async function ruleDrafts(tx: Tx, actor: ApplicationIdentity) {
  const where = { organizationId: actor.organizationId, status: 'DRAFT' as const, archivedAt: null }
  const [count, found] = await Promise.all([
    tx.alertRule.count({ where }),
    tx.alertRule.findMany({
      where,
      select: { id: true, code: true, name: true, version: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: rows,
    }),
  ])
  return {
    count,
    rows: found.map((r) => ({
      ruleId: r.id,
      code: r.code,
      name: r.name.slice(0, 200),
      version: r.version,
      updatedAt: r.updatedAt.toISOString(),
    })),
  }
}
