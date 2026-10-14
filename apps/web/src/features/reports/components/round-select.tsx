'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ReportContext } from '../hooks/use-report-context'

const day = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  })

export function RoundSelect({
  context,
}: {
  context: Pick<
    ReportContext,
    'id' | 'kind' | 'rounds' | 'currentRounds' | 'evaluationId' | 'setSelectedRound'
  >
}) {
  const { id, kind, rounds, currentRounds, evaluationId, setSelectedRound } = context
  return (
    <>
      {kind === 'EVALUATION_REPORT' && (
        <Label className="space-y-2">
          <span>Round</span>
          <Select
            value={evaluationId ?? ''}
            onValueChange={setSelectedRound}
            disabled={!currentRounds?.length}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a round" />
            </SelectTrigger>
            <SelectContent>
              {currentRounds?.map((value) => (
                <SelectItem key={value.id} value={value.id}>
                  {`${value.title}${value.signedOffAt ? ` · Signed off ${day(value.signedOffAt)}` : ''}${value.overallScore ? ` · ${value.overallScore}` : ''}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {id && !rounds.isPending && !rounds.isError && !currentRounds?.length && (
            <span className="block text-xs text-muted-foreground">
              No signed-off evaluation round yet
            </span>
          )}
          {rounds.isError && (
            <span className="block text-xs text-destructive">
              Evaluation rounds could not be verified.
            </span>
          )}
        </Label>
      )}
    </>
  )
}
