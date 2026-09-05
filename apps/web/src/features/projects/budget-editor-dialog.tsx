'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { BudgetRecord } from '@/types/pathways'

import { formatCurrency } from './activity-utils'
import {
  type BudgetAllocationSchema,
  allocationCreatesOverspend,
  budgetAllocationSchema,
} from './budget-form-validation'

export const BudgetEditorDialog = ({
  budget,
  onSaved,
}: {
  budget: BudgetRecord
  onSaved: (budget: BudgetRecord) => void
}) => {
  const [open, setOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const form = useForm<BudgetAllocationSchema>({
    defaultValues: { plannedAmount: budget.plannedAmount },
    resolver: zodResolver(budgetAllocationSchema),
  })
  const pending = form.formState.isSubmitting
  const plannedAmount = form.watch('plannedAmount')
  const overspendWarning = allocationCreatesOverspend(plannedAmount, budget.actualSpending)

  const onOpenChange = (nextOpen: boolean) => {
    if (pending) {
      return
    }

    if (nextOpen) {
      form.reset({ plannedAmount: budget.plannedAmount })
      setSaveError(null)
    }

    setOpen(nextOpen)
  }

  const onSubmit = async (values: BudgetAllocationSchema) => {
    setSaveError(null)

    try {
      const updated = await pathwaysClient.updateBudgetAllocation({
        plannedAmount: values.plannedAmount,
        projectId: budget.projectId,
      })
      onSaved(updated)
      setOpen(false)
      toast.success('Planned allocation updated.', {
        description: 'The prototype value was saved in this browser on this device.',
      })
    } catch {
      setSaveError('The planned allocation could not be saved. Check the value and try again.')
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button className="gap-2" type="button" variant="outline">
          <PencilLine className="h-4 w-4" aria-hidden="true" />
          Modify budget
        </Button>
      </DialogTrigger>
      <DialogContent closeDisabled={pending}>
        <DialogHeader>
          <DialogTitle>Modify budget</DialogTitle>
          <DialogDescription>
            Update the planned allocation only. Actual spending and expense ledger records will not
            change.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="rounded-sm border border-border bg-surface-subtle p-4">
              <p className="text-sm text-muted-foreground">Current actual spending</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {formatCurrency(budget.actualSpending)}
              </p>
            </div>
            <FormField
              control={form.control}
              name="plannedAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Planned allocation</FormLabel>
                  <FormControl aria-required="true">
                    <Input
                      inputMode="numeric"
                      min={1}
                      step={1}
                      type="number"
                      {...field}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter a whole amount in Philippine pesos. Planned allocation changes are saved
                    in this browser for this prototype.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {overspendWarning ? (
              <p className="rounded-sm border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
                This allocation is below actual spending. The remaining balance will be negative and
                utilization will exceed 100 percent.
              </p>
            ) : null}
            {saveError ? (
              <p
                className="rounded-sm border border-danger/25 bg-danger-subtle p-3 text-sm text-danger"
                role="alert"
              >
                {saveError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                disabled={pending}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {pending ? 'Saving budget...' : 'Save budget'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
