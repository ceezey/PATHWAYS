'use client'

import { type DateOrder, fittingDateOrders, readDate } from '@pathways/imports'

import { StatusBadge } from '@/components/pathways'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const orderLabels: Record<DateOrder, string> = {
  YMD: 'Year, month, day',
  DMY: 'Day, month, year',
  MDY: 'Month, day, year',
}

/** The date orders that read a column's text dates, and whether a person must pick one. */
export function columnDateOrders(values: readonly string[] | undefined, referenceYear: number) {
  const orders = fittingDateOrders(values ?? [], referenceYear)
  return { orders, needsChoice: orders.length > 1 }
}

/** How a text date column is read: a note when one order fits, a choice when several do. */
export function ImportDateOrder({
  columnLabel,
  disabled,
  idPrefix,
  referenceYear,
  value,
  values,
  onChange,
}: {
  columnLabel: string
  disabled: boolean
  idPrefix: string
  referenceYear: number
  value: DateOrder | ''
  values: readonly string[] | undefined
  onChange: (order: DateOrder) => void
}) {
  const { orders, needsChoice } = columnDateOrders(values, referenceYear)
  const sample = (values ?? []).find((text) =>
    orders.some((order) => readDate(text, { order, referenceYear })),
  )
  if (orders.length === 0 && !value) return null
  if (!needsChoice && !value) {
    return (
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Dates in {columnLabel} are read as {orderLabels[orders[0]].toLowerCase()}.
      </p>
    )
  }
  const choices = value && !orders.includes(value) ? [value, ...orders] : orders
  return (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor={`${idPrefix}-date-order`}>Date format for {columnLabel}</Label>
      <Select
        disabled={disabled}
        value={value || undefined}
        onValueChange={(next) => onChange(next as DateOrder)}
      >
        <SelectTrigger id={`${idPrefix}-date-order`}>
          <SelectValue placeholder="Choose how to read these dates" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((order) => {
            const read = sample ? readDate(sample, { order, referenceYear }) : null
            return (
              <SelectItem key={order} value={order}>
                {orderLabels[order]}
                {sample && read ? ` (${sample} is ${read})` : ''}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {value ? null : (
        <StatusBadge tone="warning">
          These dates can be read more than one way. Choose a format before validating.
        </StatusBadge>
      )}
    </div>
  )
}
