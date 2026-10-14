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
import { Textarea } from '@/components/ui/textarea'

import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'

export const JourneyNoteDialog = ({
  detail,
}: {
  detail: Pick<
    BeneficiaryDetailState,
    | 'noteOpen'
    | 'setNoteOpen'
    | 'selectedStage'
    | 'stageDisplayCode'
    | 'noteDraft'
    | 'setNoteDraft'
    | 'savingNote'
    | 'correctJourneyNote'
  >
}) => {
  const {
    noteOpen,
    setNoteOpen,
    selectedStage,
    stageDisplayCode,
    noteDraft,
    setNoteDraft,
    savingNote,
    correctJourneyNote,
  } = detail
  return (
    <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add note</DialogTitle>
          <DialogDescription>
            Add a provenance-tracked correction to the most recent journey record for{' '}
            {selectedStage ? stageDisplayCode(selectedStage) : 'the selected'}
            {' journey stage'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-2">
            <span>Date</span>
            <Input
              aria-label="Note date"
              type="date"
              value={noteDraft.eventDate}
              onChange={(event) =>
                setNoteDraft((current) => ({ ...current, eventDate: event.target.value }))
              }
            />
          </Label>
          <Textarea
            aria-label="Note text"
            placeholder="Journey note"
            value={noteDraft.description}
            onChange={(event) =>
              setNoteDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
          <Textarea
            aria-label="Journey note"
            className="min-h-11"
            maxLength={1000}
            placeholder="Optional journey note (max 1000 characters)"
            value={noteDraft.note}
            onChange={(event) =>
              setNoteDraft((current) => ({ ...current, note: event.target.value }))
            }
          />
          <Textarea
            aria-label="Correction reason"
            placeholder="Reason for this correction"
            value={noteDraft.reason}
            onChange={(event) =>
              setNoteDraft((current) => ({ ...current, reason: event.target.value }))
            }
          />
        </div>
        <DialogFooter>
          <Button
            disabled={savingNote}
            type="button"
            variant="outline"
            onClick={() => setNoteOpen(false)}
          >
            Cancel
          </Button>
          <Button disabled={savingNote} onClick={() => void correctJourneyNote()} type="button">
            {savingNote ? 'Saving...' : 'Save note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
