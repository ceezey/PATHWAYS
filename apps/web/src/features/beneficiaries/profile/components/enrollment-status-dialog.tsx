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
import type { EnrollmentJourneyEventInput } from '@/types/pathways'

import { projectTitle } from '../../beneficiaries.utils'
import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'

const journeyEventTypeLabel: Record<EnrollmentJourneyEventInput['eventType'], string> = {
  COMPLETION: 'Complete enrollment',
  FOLLOW_UP: 'Record follow-up',
  DROPOUT: 'Mark as dropped out',
  TRANSFER: 'Transfer to another project',
}

export const EnrollmentStatusDialog = ({
  detail,
}: {
  detail: Pick<
    BeneficiaryDetailState,
    | 'journeyOpen'
    | 'setJourneyOpen'
    | 'beneficiary'
    | 'journeyDraft'
    | 'setJourneyDraft'
    | 'transferDestinationOptions'
    | 'projects'
    | 'savingJourney'
    | 'transitionJourney'
  >
}) => {
  const {
    journeyOpen,
    setJourneyOpen,
    beneficiary,
    journeyDraft,
    setJourneyDraft,
    transferDestinationOptions,
    projects,
    savingJourney,
    transitionJourney,
  } = detail
  return (
    <Dialog open={journeyOpen} onOpenChange={setJourneyOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update enrollment status</DialogTitle>
          <DialogDescription>
            Record an enrollment journey event for {beneficiary.displayName}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select
            value={journeyDraft.eventType}
            onValueChange={(value) =>
              setJourneyDraft((current) => ({
                ...current,
                eventType: value as EnrollmentJourneyEventInput['eventType'],
              }))
            }
          >
            <SelectTrigger aria-label="Enrollment status">
              <SelectValue placeholder="Select an outcome" />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(journeyEventTypeLabel) as EnrollmentJourneyEventInput['eventType'][]
              ).map((eventType) => (
                <SelectItem key={eventType} value={eventType}>
                  {journeyEventTypeLabel[eventType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {journeyDraft.eventType === 'TRANSFER' ? (
            transferDestinationOptions.length > 0 ? (
              <Select
                value={journeyDraft.destinationProjectId}
                onValueChange={(value) =>
                  setJourneyDraft((current) => ({ ...current, destinationProjectId: value }))
                }
              >
                <SelectTrigger aria-label="Destination project">
                  <SelectValue placeholder="Select destination project" />
                </SelectTrigger>
                <SelectContent>
                  {transferDestinationOptions.map((enrollment) => (
                    <SelectItem key={enrollment.projectId} value={enrollment.projectId}>
                      {projectTitle(enrollment.projectId, projects)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No other active project enrollment is available for transfer.
              </p>
            )
          ) : null}
          <Label className="space-y-2">
            <span>Date</span>
            <Input
              aria-label="Enrollment status date"
              type="date"
              value={journeyDraft.eventDate}
              onChange={(event) =>
                setJourneyDraft((current) => ({ ...current, eventDate: event.target.value }))
              }
            />
          </Label>
          <Textarea
            aria-label="Enrollment status description"
            placeholder="Describe the enrollment status change"
            value={journeyDraft.description}
            onChange={(event) =>
              setJourneyDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
          <Textarea
            aria-label="Journey note"
            className="min-h-11"
            maxLength={1000}
            placeholder="Optional journey note (max 1000 characters)"
            value={journeyDraft.note}
            onChange={(event) =>
              setJourneyDraft((current) => ({ ...current, note: event.target.value }))
            }
          />
        </div>
        <DialogFooter>
          <Button
            disabled={savingJourney}
            type="button"
            variant="outline"
            onClick={() => setJourneyOpen(false)}
          >
            Cancel
          </Button>
          <Button disabled={savingJourney} onClick={() => void transitionJourney()} type="button">
            {savingJourney ? 'Saving...' : 'Save enrollment status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
