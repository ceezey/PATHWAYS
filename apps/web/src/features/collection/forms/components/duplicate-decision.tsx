'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { CollectionState } from '../hooks/use-collection-state'

export function DuplicateDecision({
  state,
}: {
  state: Pick<CollectionState, 'duplicateDecision' | 'intent' | 'mutation' | 'setDuplicateDecision'>
}) {
  const { duplicateDecision, intent, mutation, setDuplicateDecision } = state
  return (
    <div className="space-y-2">
      <Label htmlFor="duplicate-decision">Duplicate records decision</Label>
      <Select
        value={duplicateDecision}
        onValueChange={(value) => {
          if (mutation.current) return
          intent.current++
          setDuplicateDecision(value as 'pending' | 'skip' | 'keep')
        }}
      >
        <SelectTrigger id="duplicate-decision">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Decide when duplicates are flagged</SelectItem>
          <SelectItem disabled title="Not available yet" value="skip">
            Skip duplicates (not available yet)
          </SelectItem>
          <SelectItem disabled title="Not available yet" value="keep">
            Keep confirmed duplicates (not available yet)
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
