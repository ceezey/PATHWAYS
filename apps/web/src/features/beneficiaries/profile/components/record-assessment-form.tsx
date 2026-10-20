'use client'

import { businessCalendarDate, recordAssessmentRequest } from '@pathways/shared'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { evaluationsClient } from '@/lib/api/evaluations'
import type { ActivitySummary } from '@/types/pathways'

type FieldName = 'score' | 'maximumScore' | 'assessmentDate'

const fieldLabel: Record<FieldName, string> = {
  score: 'Score',
  maximumScore: 'Maximum score',
  assessmentDate: 'Assessment date',
}

const typeOptions = [
  { value: 'PRE_TEST', label: 'Pre-test' },
  { value: 'POST_TEST', label: 'Post-test' },
] as const

export const RecordAssessmentForm = ({
  projectId,
  enrollmentId,
  activities,
  onRecorded,
}: {
  projectId: string
  enrollmentId: string | undefined
  activities: ActivitySummary[]
  onRecorded: () => Promise<void>
}) => {
  const today = businessCalendarDate(new Date(), 'Asia/Manila')
  const [type, setType] = useState<'PRE_TEST' | 'POST_TEST'>('PRE_TEST')
  const [activityId, setActivityId] = useState('')
  const [score, setScore] = useState('')
  const [maximumScore, setMaximumScore] = useState('100')
  const [assessmentDate, setAssessmentDate] = useState(today)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  // The first activity of the stage is the default until another one is chosen.
  const chosenActivityId = activities.some((item) => item.id === activityId)
    ? activityId
    : (activities[0]?.id ?? '')
  if (!enrollmentId || !chosenActivityId)
    return (
      <p className="text-sm text-muted-foreground">
        A score can be recorded once an activity is mapped to this stage.
      </p>
    )

  const save = async () => {
    if (saving) return
    const parsed = recordAssessmentRequest.safeParse({
      enrollmentId,
      activityId: chosenActivityId,
      type,
      score: score.trim(),
      maximumScore: maximumScore.trim(),
      assessmentDate,
    })
    const next: Partial<Record<FieldName, string>> = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName
        if (field in fieldLabel && !next[field])
          next[field] = `${fieldLabel[field]} ${issue.message}.`
      }
    } else if (assessmentDate > today) {
      next.assessmentDate = 'Assessment date cannot be in the future.'
    }
    setErrors(next)
    setFailure('')
    setNotice('')
    if (!parsed.success || Object.keys(next).length > 0) return
    setSaving(true)
    try {
      await evaluationsClient.recordBeneficiaryAssessment(projectId, parsed.data)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'The score could not be recorded.')
      setSaving(false)
      return
    }
    setScore('')
    // A failed list refresh after a saved score must not read as a save failure.
    await onRecorded().catch(() => setNotice('Score saved. Reload to see it in the list.'))
    setSaving(false)
  }

  const describedBy = (field: FieldName) =>
    errors[field] ? `record-assessment-${field}-error` : undefined
  const fieldError = (field: FieldName) =>
    errors[field] ? (
      <p className="text-sm text-destructive" id={`record-assessment-${field}-error`} role="alert">
        {errors[field]}
      </p>
    ) : null

  return (
    <form
      className="space-y-4 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h3 className="text-sm font-semibold text-foreground">Record score</h3>
      <p className="text-sm text-muted-foreground">
        Recorded scores cannot be edited. To fix a mistake, record a newer result.
      </p>
      {activities.length > 1 ? (
        <div className="space-y-2">
          <Label htmlFor="record-assessment-activity">Activity</Label>
          <Select value={chosenActivityId} onValueChange={setActivityId}>
            <SelectTrigger id="record-assessment-activity">
              <SelectValue placeholder="Select activity" />
            </SelectTrigger>
            <SelectContent>
              {activities.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <fieldset className="flex gap-4">
        <legend className="mb-2 text-sm font-medium">Assessment type</legend>
        {typeOptions.map((option) => (
          <Label className="flex items-center gap-2" key={option.value}>
            <input
              checked={type === option.value}
              name="record-assessment-type"
              onChange={() => setType(option.value)}
              type="radio"
              value={option.value}
            />
            {option.label}
          </Label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="record-assessment-score">Score</Label>
          <Input
            aria-describedby={describedBy('score')}
            aria-invalid={Boolean(errors.score)}
            id="record-assessment-score"
            inputMode="decimal"
            onChange={(event) => setScore(event.target.value)}
            value={score}
          />
          {fieldError('score')}
        </div>
        <div className="space-y-2">
          <Label htmlFor="record-assessment-maximum">Maximum score</Label>
          <Input
            aria-describedby={describedBy('maximumScore')}
            aria-invalid={Boolean(errors.maximumScore)}
            id="record-assessment-maximum"
            inputMode="decimal"
            onChange={(event) => setMaximumScore(event.target.value)}
            value={maximumScore}
          />
          {fieldError('maximumScore')}
        </div>
        <div className="space-y-2">
          <Label htmlFor="record-assessment-date">Assessment date</Label>
          <Input
            aria-describedby={describedBy('assessmentDate')}
            aria-invalid={Boolean(errors.assessmentDate)}
            id="record-assessment-date"
            max={today}
            onChange={(event) => setAssessmentDate(event.target.value)}
            type="date"
            value={assessmentDate}
          />
          {fieldError('assessmentDate')}
        </div>
      </div>
      {failure ? (
        <p className="text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
      {notice ? <output className="block text-sm text-muted-foreground">{notice}</output> : null}
      <Button disabled={saving} type="submit">
        {saving ? 'Saving...' : 'Save score'}
      </Button>
    </form>
  )
}
