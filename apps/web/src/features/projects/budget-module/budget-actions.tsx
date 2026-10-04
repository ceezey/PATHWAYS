'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { createdSince, fingerprintOf } from '@/lib/forms/pending-create'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreDataClient } from '@/lib/services/core-feature-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

const fail = (error: unknown, fallback: string) =>
  toast.error(error instanceof Error ? error.message : fallback)

const AllocationDialog = ({
  projectId,
  onDone,
}: { projectId: string; onDone: () => Promise<void> }) => {
  const { profile } = useCurrentRole()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const pendingCreate = usePendingCreate<{ id: string }>({
    profile,
    kind: 'budget-allocation',
    projectId,
    successMessage: 'Budget allocation recorded.',
    findCreated: async (fingerprint, startedAt) =>
      (await coreDataClient.budgets(projectId)).find(
        (row) =>
          fingerprintOf(row.category) === fingerprint && createdSince(row.updatedAt, startedAt),
      ),
    onConfirmed: () => void onDone(),
  })
  const [category, setCategory] = useState('')
  const [planned, setPlanned] = useState('')
  const [remarks, setRemarks] = useState('')
  const save = async () => {
    setBusy(true)
    try {
      const created = await pendingCreate.submit(fingerprintOf(category), () =>
        coreDataClient.createBudget(projectId, {
          category: category.trim(),
          plannedBudget: planned.trim(),
          remarks: remarks.trim() || null,
        }),
      )
      if (!created) return
      toast.success('Budget allocation recorded.')
      setOpen(false)
      setCategory('')
      setPlanned('')
      setRemarks('')
      await onDone()
    } catch (error) {
      fail(error, 'Budget creation unavailable.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" variant="outline">
        Add allocation
      </Button>
      <Dialog onOpenChange={(next) => !busy && setOpen(next)} open={open}>
        <DialogShell
          description="Record a planned budget line for this project."
          title="Add allocation"
        >
          <div className="space-y-3">
            <Label>
              Category
              <Input onChange={(e) => setCategory(e.target.value)} value={category} />
            </Label>
            <Label>
              Planned amount (PHP)
              <Input
                inputMode="decimal"
                onChange={(e) => setPlanned(e.target.value)}
                value={planned}
              />
            </Label>
            <Label>
              Remarks (optional)
              <Input onChange={(e) => setRemarks(e.target.value)} value={remarks} />
            </Label>
          </div>
          {pendingCreate.notice ? (
            <output className="block text-sm text-info">{pendingCreate.notice}</output>
          ) : null}
          <DialogFooter>
            <Button
              className="gap-2"
              disabled={busy || pendingCreate.pending || !category.trim() || !planned.trim()}
              onClick={() => void save()}
            >
              {busy || pendingCreate.pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {busy || pendingCreate.pending ? 'Recording...' : 'Record allocation'}
            </Button>
          </DialogFooter>
        </DialogShell>
      </Dialog>
    </>
  )
}

const ExpenseDialog = ({
  projectId,
  onDone,
}: { projectId: string; onDone: () => Promise<void> }) => {
  const requests = useOperationRequestId()
  const refs = useAuthorizedRead('expense-budget-references', projectId, 'expenses.submit', (s) =>
    coreDataClient.budgetReferences(projectId, s),
  )
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const save = async () => {
    setBusy(true)
    try {
      const body = {
        budgetRecordId: reference,
        description: description.trim(),
        amount: amount.trim(),
        expenseDate: date,
      }
      const clientRequestId = requests.forBody(projectId, body)
      const ack = await coreDataClient.submitExpense(projectId, { clientRequestId, ...body })
      requests.acknowledge(clientRequestId)
      if (receipt) await coreDataClient.uploadReceipt(projectId, ack.id, ack.updatedAt, receipt)
      toast.success(
        receipt ? 'Expense submitted with receipt.' : 'Expense submitted without a receipt.',
      )
      setOpen(false)
      setDescription('')
      setAmount('')
      setReceipt(null)
      await onDone()
    } catch (error) {
      fail(error, 'Expense submission unavailable.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        Log expense
      </Button>
      <Dialog onOpenChange={(next) => !busy && setOpen(next)} open={open}>
        <DialogShell
          description="Submit an expense for review. A private receipt is needed before it can be verified."
          title="Log expense"
        >
          <div className="space-y-3">
            <Label>
              Budget line
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(e) => setReference(e.target.value)}
                value={reference}
              >
                <option value="">Select a budget line</option>
                {(refs.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.category === 'ACTIVITY_PROFILE_TOTAL' ? 'Activity budget' : row.category}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Description
              <Input onChange={(e) => setDescription(e.target.value)} value={description} />
            </Label>
            <Label>
              Amount (PHP)
              <Input
                inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)}
                value={amount}
              />
            </Label>
            <Label>
              Expense date
              <Input onChange={(e) => setDate(e.target.value)} type="date" value={date} />
            </Label>
            <Label>
              Private receipt (PDF, PNG or JPEG, up to 10 MiB)
              <Input
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                type="file"
              />
            </Label>
          </div>
          <DialogFooter>
            <Button
              disabled={busy || !reference || !description.trim() || !amount.trim() || !date}
              onClick={() => void save()}
            >
              Submit expense
            </Button>
          </DialogFooter>
        </DialogShell>
      </Dialog>
    </>
  )
}

/** Allocation and expense entry, shown only to roles holding the matching permission. */
export const BudgetActions = ({
  projectId,
  onDone,
}: { projectId: string; onDone: () => Promise<void> }) => {
  const { profile } = useCurrentRole()
  return (
    <div className="flex flex-wrap gap-2">
      {principalHasAtomicPermission(profile, 'budgets.create') ? (
        <AllocationDialog onDone={onDone} projectId={projectId} />
      ) : null}
      {principalHasAtomicPermission(profile, 'expenses.submit') ? (
        <ExpenseDialog onDone={onDone} projectId={projectId} />
      ) : null}
    </div>
  )
}
