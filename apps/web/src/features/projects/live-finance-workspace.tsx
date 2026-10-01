'use client'
import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import {
  coreDataClient,
  downloadCoreArtifact,
  type expenseAck,
} from '@/lib/services/core-feature-client'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { FinanceBudgetSummary } from './finance-budget-summary'

export function LiveFinanceWorkspace({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const boundary = useSensitiveDraftOwner(
    profile,
    'finance-screen',
    'projects.read',
    projectId,
    projectId,
  )
  return (
    <FinanceContent
      key={`${boundary?.key ?? 'unavailable'}:${boundary?.generation ?? 0}`}
      projectId={projectId}
    />
  )
}
function FinanceContent({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const can = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>
    principalHasAtomicPermission(profile, permission)
  const budgets = useAuthorizedRead('finance-budgets', projectId, 'budgets.read', (signal) =>
    coreDataClient.budgets(projectId, signal),
  )
  const expenses = useAuthorizedRead('finance-expenses', projectId, 'expenses.read', (signal) =>
    coreDataClient.expenses(projectId, signal),
  )
  const references = useAuthorizedRead(
    'expense-budget-references',
    projectId,
    'expenses.submit',
    (signal) => coreDataClient.budgetReferences(projectId, signal),
  )
  const activityNames = useAuthorizedRead(
    'expense-reference-activities',
    projectId,
    'activities.context.read',
    (signal) => pathwaysClient.getActivityContext(projectId, signal),
    can('activities.context.read'),
  )
  const referenceLabel = (row: { category: string; activityId: string | null }) => {
    if (row.category !== 'ACTIVITY_PROFILE_TOTAL') return row.category
    const title = activityNames.data?.find((activity) => activity.id === row.activityId)?.title
    return title ? `Activity budget: ${title}` : 'Activity budget'
  }
  const currentBudgets = !budgets.isError && !budgets.isPending ? budgets.data : undefined
  const currentReferences =
    !references.isError && !references.isPending ? references.data : undefined
  const budgetOwner = useSensitiveDraftOwner(
    profile,
    'budget-create',
    'budgets.create',
    projectId,
    projectId,
  )
  const expenseOwner = useSensitiveDraftOwner(
    profile,
    'expense-submit',
    'expenses.submit',
    projectId,
    projectId,
  )
  const receiptOwner = useSensitiveDraftOwner(
    profile,
    'expense-receipt',
    'expenses.evidence.submit',
    projectId,
    projectId,
  )
  const verifyOwner = useSensitiveDraftOwner(
    profile,
    'expense-verify',
    'expenses.verify',
    projectId,
    projectId,
  )
  const approveOwner = useSensitiveDraftOwner(
    profile,
    'expense-approve',
    'expenses.approve',
    projectId,
    projectId,
  )
  const signoffOwner = useSensitiveDraftOwner(
    profile,
    'expense-signoff',
    'expenses.signoff',
    projectId,
    projectId,
  )
  const requests = useOperationRequestId()
  const budgetUpdateOwner = useSensitiveDraftOwner(
    profile,
    'budget-update',
    'budgets.update',
    projectId,
    projectId,
  )
  const downloadOwner = useSensitiveDraftOwner(
    profile,
    'expense-download',
    'evidence.read',
    projectId,
    projectId,
  )
  const download = async (expenseId: string, evidenceId: string) => {
    const captured = downloadOwner
    if (!captured?.isCurrent()) return
    try {
      await downloadCoreArtifact(
        `/projects/${projectId}/finance/expenses/${expenseId}/receipt`,
        `receipt-${evidenceId}.pdf`,
        captured.isCurrent,
      )
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Receipt download unavailable.')
    }
  }
  const [category, setCategory] = useState('')
  const [planned, setPlanned] = useState('')
  const [remarks, setRemarks] = useState('')
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [pending, setPending] = useState<z.infer<typeof expenseAck> | null>(null)
  const [busy, setBusy] = useState(false)
  const activeOperation = useRef<{ isCurrent: () => boolean } | null>(null)
  // Keyed per expense so a rationale can never carry over to a different expense.
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [editingBudget, setEditingBudget] = useState<{ id: string; updatedAt: string } | null>(null)
  const allocationFormRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!editingBudget) return
    const form = allocationFormRef.current
    if (!form) return
    form.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    form.querySelector('input')?.focus({ preventScroll: true })
  }, [editingBudget])
  // biome-ignore lint/correctness/useExhaustiveDependencies: An allocation edit is invalidated with its update authority.
  useEffect(() => {
    setEditingBudget(null)
  }, [budgetUpdateOwner?.key, budgetUpdateOwner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Allocation drafts are invalidated with their write authority.
  useEffect(() => {
    setCategory('')
    setPlanned('')
    setRemarks('')
  }, [budgetOwner?.key, budgetOwner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Expense drafts and acknowledgements cannot survive submitter ownership changes.
  useEffect(() => {
    setReference('')
    setDescription('')
    setAmount('')
    setExpenseDate('')
    setPending(null)
  }, [expenseOwner?.key, expenseOwner?.generation])
  // biome-ignore lint/correctness/useExhaustiveDependencies: A changed review or receipt grant invalidates pending controls and their private acknowledgement.
  useEffect(() => {
    setPending(null)
    setReasons({})
  }, [
    receiptOwner?.key,
    receiptOwner?.generation,
    verifyOwner?.key,
    approveOwner?.key,
    signoffOwner?.key,
  ])
  useEffect(() => {
    if (references.isError || references.isPending) setReference('')
  }, [references.isError, references.isPending])
  useEffect(() => {
    if (!currentBudgets && editingBudget) {
      setEditingBudget(null)
      setCategory('')
      setPlanned('')
      setRemarks('')
    }
  }, [currentBudgets, editingBudget])
  useEffect(() => {
    if (activeOperation.current && !activeOperation.current.isCurrent()) {
      activeOperation.current = null
      setBusy(false)
    }
  })
  const refresh = async () => {
    await Promise.all([budgets.refetch(), expenses.refetch(), references.refetch()])
  }
  const createBudget = async () => {
    if (!budgetOwner?.isCurrent() || busy || activeOperation.current) return
    const captured = budgetOwner
    activeOperation.current = captured
    setBusy(true)
    try {
      await coreDataClient.createBudget(projectId, {
        category,
        plannedBudget: planned,
        remarks: remarks || null,
      })
      if (captured.isCurrent()) {
        setCategory('')
        setPlanned('')
        setRemarks('')
        await refresh()
        if (captured.isCurrent()) toast.success('Budget allocation recorded.')
      }
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Budget creation unavailable.')
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const replaceBudget = async () => {
    const captured = budgetUpdateOwner
    const editing = editingBudget
    if (
      !captured?.isCurrent() ||
      !editing ||
      busy ||
      Boolean(activeOperation.current) ||
      !currentBudgets?.some((row) => row.id === editing.id && row.updatedAt === editing.updatedAt)
    )
      return
    activeOperation.current = captured
    setBusy(true)
    try {
      await coreDataClient.replaceBudget(projectId, editing.id, {
        category: category.trim(),
        plannedBudget: planned.trim(),
        remarks: remarks.trim() || null,
        expectedUpdatedAt: editing.updatedAt,
      })
      if (!captured.isCurrent()) return
      setEditingBudget(null)
      setCategory('')
      setPlanned('')
      setRemarks('')
      await refresh()
      if (captured.isCurrent()) toast.success('Budget allocation updated.')
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Allocation update unavailable.')
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const submit = async () => {
    if (
      !expenseOwner?.isCurrent() ||
      busy ||
      Boolean(activeOperation.current) ||
      !currentReferences?.some((row) => row.id === reference)
    )
      return
    const captured = expenseOwner
    const body = {
      budgetRecordId: reference,
      description: description.trim(),
      amount: amount.trim(),
      expenseDate,
    }
    const clientRequestId = requests.forBody(`${captured.key}:${captured.generation}`, body)
    activeOperation.current = captured
    setBusy(true)
    try {
      const ack = await coreDataClient.submitExpense(projectId, {
        clientRequestId,
        ...body,
      })
      if (captured.isCurrent()) {
        requests.acknowledge(clientRequestId)
        setPending(ack)
        setDescription('')
        setAmount('')
        await refresh()
        if (captured.isCurrent())
          toast.success('Expense submitted. Attach its private receipt below.')
      }
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Expense submission unavailable.')
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const attach = async (file: File, ack: z.infer<typeof expenseAck>) => {
    if (!receiptOwner?.isCurrent() || busy || activeOperation.current) return
    const captured = receiptOwner
    activeOperation.current = captured
    setBusy(true)
    try {
      const next = await coreDataClient.uploadReceipt(projectId, ack.id, ack.updatedAt, file)
      if (captured.isCurrent()) {
        setPending(next)
        await refresh()
        if (captured.isCurrent()) toast.success('Private receipt attached.')
      }
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Receipt submission unavailable.')
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const action = async (
    id: string,
    updatedAt: string,
    operation: 'VERIFY' | 'APPROVE' | 'REJECT' | 'SIGNOFF',
    stage: 'VERIFY' | 'APPROVE',
  ) => {
    const captured =
      operation === 'SIGNOFF' ? signoffOwner : stage === 'VERIFY' ? verifyOwner : approveOwner
    if (busy || activeOperation.current || !captured?.isCurrent()) return
    activeOperation.current = captured
    setBusy(true)
    try {
      if (operation === 'SIGNOFF') await coreDataClient.signoffExpense(projectId, id)
      else
        await coreDataClient.reviewExpense(projectId, id, {
          expectedUpdatedAt: updatedAt,
          stage,
          decision: operation,
          ...(operation === 'REJECT' ? { reason: reasons[id] ?? '' } : {}),
        })
      if (!captured.isCurrent()) return
      if (operation === 'REJECT') setReasons(({ [id]: _submitted, ...remaining }) => remaining)
      await expenses.refetch()
      if (!captured.isCurrent()) return
      toast.success(
        operation === 'SIGNOFF' ? 'Final sign-off recorded.' : 'Expense review recorded.',
      )
    } catch (error) {
      if (captured.isCurrent())
        toast.error(error instanceof Error ? error.message : 'Financial review unavailable.')
    } finally {
      if (activeOperation.current === captured) {
        activeOperation.current = null
        setBusy(false)
      }
    }
  }
  const receipt = (ack: z.infer<typeof expenseAck>) => (
    <Label className="block space-y-2">
      <span>Private receipt (PDF, PNG or JPEG; maximum 10 MiB)</span>
      <Input
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        disabled={
          busy || !receiptOwner || ack.status !== 'PENDING' || Boolean(ack.receiptEvidenceId)
        }
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file && file.size <= 10485760) void attach(file, ack)
          else if (file) toast.error('Receipt exceeds 10 MiB.')
        }}
      />
    </Label>
  )
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project finance"
        title="Budget & Finance"
        description="Manage scoped allocations, private receipts, separated reviews and final sign-off."
      />
      {can('budgets.read') && can('expenses.read') && budgets.data && expenses.data ? (
        <FinanceBudgetSummary
          budgets={budgets.data}
          expenses={expenses.data}
          projectId={projectId}
        />
      ) : null}
      <SectionCard
        title="Budget allocation"
        description="Budget detail requires current budget permission; expense submission uses references without exposing allocation amounts."
      >
        {can('budgets.read') ? (
          budgets.isPending ? (
            <AsyncState
              status="loading"
              title="Loading allocations"
              description="Verifying budget scope."
            />
          ) : budgets.isError ? (
            <AsyncState
              status="error"
              title="Allocations unavailable"
              description="Current access could not be verified."
              onRetry={() => void budgets.refetch()}
            />
          ) : !budgets.data?.length ? (
            <EmptyState
              title="No allocations"
              description="Record a scoped allocation before submitting expenses."
            />
          ) : (
            <div className="space-y-3">
              {budgets.data.map((row) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <p className="font-semibold">{referenceLabel(row)}</p>
                  <p>PHP {row.plannedBudget}</p>
                  {row.remarks ? (
                    <p className="text-sm text-muted-foreground">{row.remarks}</p>
                  ) : null}
                  {budgetUpdateOwner && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditingBudget({ id: row.id, updatedAt: row.updatedAt })
                        setCategory(row.category)
                        setPlanned(row.plannedBudget)
                        setRemarks(row.remarks ?? '')
                      }}
                    >
                      Edit allocation
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Allocation amounts are outside your current access.
          </p>
        )}
        {(budgetOwner || (editingBudget && budgetUpdateOwner)) &&
        (!editingBudget || currentBudgets) ? (
          <div ref={allocationFormRef} className="mt-5 grid gap-3 md:grid-cols-3">
            <Label>
              Category
              <Input
                maxLength={200}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </Label>
            <Label>
              Planned allocation (PHP)
              <Input
                inputMode="decimal"
                value={planned}
                onChange={(event) => setPlanned(event.target.value)}
              />
            </Label>
            <Label>
              Remarks
              <Input
                maxLength={2000}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </Label>
            <Button
              disabled={busy || !category.trim() || !planned.trim()}
              onClick={() => void (editingBudget ? replaceBudget() : createBudget())}
            >
              {editingBudget ? 'Save allocation changes' : 'Record allocation'}
            </Button>
            {editingBudget && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEditingBudget(null)
                  setCategory('')
                  setPlanned('')
                  setRemarks('')
                }}
              >
                Cancel edit
              </Button>
            )}
          </div>
        ) : null}
      </SectionCard>
      {expenseOwner ? (
        <SectionCard
          title="Submit expense"
          description="Submission records the real actor. Receipt verification and approval remain separate operations."
        >
          {references.isError || references.isPending ? (
            <output className="text-sm text-muted-foreground">
              {references.isPending
                ? 'Verifying current budget references...'
                : 'Budget references unavailable. Retry to verify current expense submission access.'}{' '}
              <Button variant="outline" onClick={() => void references.refetch()}>
                Retry references
              </Button>
            </output>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Label>
              Budget reference
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={reference}
                disabled={!currentReferences}
                onChange={(event) => setReference(event.target.value)}
              >
                <option value="">Choose an allocation</option>
                {currentReferences?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {referenceLabel(row)}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Description
              <Input
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Label>
            <Label>
              Amount (PHP)
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Label>
            <Label>
              Expense date
              <Input
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
            </Label>
            <Button
              disabled={
                busy ||
                Boolean(activeOperation.current) ||
                !currentReferences?.some((row) => row.id === reference) ||
                !description.trim() ||
                !amount.trim() ||
                !expenseDate
              }
              onClick={() => void submit()}
            >
              Submit expense
            </Button>
          </div>
          {pending ? (
            <div className="mt-5 rounded-xl border p-4">
              <p className="mb-3 text-sm">
                Own submission {pending.id} · {pending.status}
              </p>
              {receipt(pending)}
            </div>
          ) : null}
        </SectionCard>
      ) : null}
      {can('expenses.read') ? (
        <SectionCard
          title="Expenses and liquidation"
          description="Pending → verified → approved → final sign-off. Each stage retains its actual actor and timestamp."
        >
          {expenses.isPending ? (
            <AsyncState
              status="loading"
              title="Loading expenses"
              description="Verifying current financial access."
            />
          ) : expenses.isError ? (
            <AsyncState
              status="error"
              title="Expenses unavailable"
              description="Current financial scope could not be verified."
              onRetry={() => void expenses.refetch()}
            />
          ) : !expenses.data?.length ? (
            <EmptyState
              title="No recorded expenses"
              description="Submitted expenses appear after their authorized transaction completes."
            />
          ) : (
            <div className="space-y-4">
              {expenses.data.map((row) => (
                <div key={row.id} className="space-y-3 rounded-xl border p-4">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="font-semibold">{row.description}</p>
                      <p className="text-sm">
                        PHP {row.amount} · {row.expenseDate}
                      </p>
                    </div>
                    <StatusBadge>{row.status}</StatusBadge>
                  </div>
                  {row.signedOffAt ? (
                    <p className="text-sm">
                      Final sign-off: {new Date(row.signedOffAt).toLocaleString()} ·{' '}
                      {row.signedOffById}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    {row.receiptEvidenceId && can('evidence.read') ? (
                      <Button
                        variant="outline"
                        onClick={() => void download(row.id, row.receiptEvidenceId ?? '')}
                      >
                        Inspect private receipt
                      </Button>
                    ) : null}
                    {row.status === 'PENDING' &&
                    row.receiptEvidenceId &&
                    can('expenses.verify') &&
                    row.submittedById !== profile?.userId ? (
                      <Button
                        disabled={busy}
                        onClick={() => void action(row.id, row.updatedAt, 'VERIFY', 'VERIFY')}
                      >
                        Verify receipt and expense
                      </Button>
                    ) : null}
                    {row.status === 'VERIFIED' &&
                    can('expenses.approve') &&
                    ![row.submittedById, row.verifiedById].includes(profile?.userId ?? '') ? (
                      <Button
                        disabled={busy}
                        onClick={() => void action(row.id, row.updatedAt, 'APPROVE', 'APPROVE')}
                      >
                        Approve expense
                      </Button>
                    ) : null}
                    {row.status === 'APPROVED' &&
                    !row.signedOffAt &&
                    can('expenses.signoff') &&
                    ![row.submittedById, row.verifiedById, row.approvedById].includes(
                      profile?.userId ?? '',
                    ) ? (
                      <Button
                        disabled={busy}
                        onClick={() => void action(row.id, row.updatedAt, 'SIGNOFF', 'APPROVE')}
                      >
                        Record final sign-off
                      </Button>
                    ) : null}
                  </div>
                  {row.status === 'PENDING' &&
                  row.submittedById === profile?.userId &&
                  !row.receiptEvidenceId
                    ? receipt({
                        id: row.id,
                        projectId,
                        status: row.status,
                        updatedAt: row.updatedAt,
                        receiptEvidenceId: null,
                      })
                    : null}
                  {(row.status === 'PENDING' &&
                    can('expenses.verify') &&
                    row.submittedById !== profile?.userId) ||
                  (row.status === 'VERIFIED' &&
                    can('expenses.approve') &&
                    ![row.submittedById, row.verifiedById].includes(profile?.userId ?? '')) ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <Label>
                        Reason for rejection
                        <Input
                          aria-label={`Reason for rejecting ${row.description}`}
                          maxLength={2000}
                          value={reasons[row.id] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value
                            setReasons((current) => ({ ...current, [row.id]: value }))
                          }}
                        />
                      </Label>
                      <Button
                        variant="outline"
                        disabled={busy || !reasons[row.id]?.trim()}
                        onClick={() =>
                          void action(
                            row.id,
                            row.updatedAt,
                            'REJECT',
                            row.status === 'PENDING' ? 'VERIFY' : 'APPROVE',
                          )
                        }
                      >
                        Reject with reason
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  )
}
