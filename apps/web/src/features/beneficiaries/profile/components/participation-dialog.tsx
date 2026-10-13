'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'

export const ParticipationDialog = ({
  detail,
}: {
  detail: Pick<
    BeneficiaryDetailState,
    | 'participationOpen'
    | 'setParticipationOpen'
    | 'selectedStage'
    | 'stageDisplayCode'
    | 'participationDraft'
    | 'setParticipationDraft'
    | 'selectedStageParticipationActivities'
    | 'savingParticipation'
    | 'recordParticipation'
  >
}) => {
  const {
    participationOpen,
    setParticipationOpen,
    selectedStage,
    stageDisplayCode,
    participationDraft,
    setParticipationDraft,
    selectedStageParticipationActivities,
    savingParticipation,
    recordParticipation,
  } = detail
  return (
    <Dialog open={participationOpen} onOpenChange={setParticipationOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record participation</DialogTitle>
          <DialogDescription>
            Record an activity and attendance outcome for{' '}
            {selectedStage ? stageDisplayCode(selectedStage) : 'the selected'}
            {' journey stage'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select
            value={participationDraft.activityId}
            onValueChange={(value) =>
              setParticipationDraft((current) => ({ ...current, activityId: value }))
            }
          >
            <SelectTrigger aria-label="Participation activity">
              <SelectValue placeholder="Select activity" />
            </SelectTrigger>
            <SelectContent>
              {selectedStageParticipationActivities.map((activity) => (
                <SelectItem key={activity.id} value={activity.id}>
                  {activity.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="space-y-2">
            <span>Date</span>
            <Input
              aria-label="Participation date"
              type="date"
              value={participationDraft.participatedAt}
              onChange={(event) =>
                setParticipationDraft((current) => ({
                  ...current,
                  participatedAt: event.target.value,
                }))
              }
            />
          </Label>
          <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <legend className="sr-only">Attendance status</legend>
            {['Present', 'Absent', 'Excused', 'Completed', 'Not completed'].map((status) => (
              <Button
                aria-pressed={participationDraft.attendanceStatus === status}
                key={status}
                type="button"
                variant={participationDraft.attendanceStatus === status ? 'default' : 'outline'}
                onClick={() =>
                  setParticipationDraft((current) => ({
                    ...current,
                    attendanceStatus: status,
                  }))
                }
              >
                {status}
              </Button>
            ))}
          </fieldset>
          <Textarea
            aria-label="Participation notes"
            placeholder="Participation notes"
            value={participationDraft.note}
            onChange={(event) =>
              setParticipationDraft((current) => ({ ...current, note: event.target.value }))
            }
          />
        </div>
        <DialogFooter>
          <Button
            disabled={savingParticipation}
            type="button"
            variant="outline"
            onClick={() => setParticipationOpen(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={savingParticipation}
            onClick={() => void recordParticipation()}
            type="button"
          >
            {savingParticipation ? 'Saving...' : 'Save participation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
