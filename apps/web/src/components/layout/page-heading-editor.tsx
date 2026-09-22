'use client'

import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import type { EditablePageHeadingKey } from '@/constants/display-labels'
import { useDisplayLabels } from '@/hooks/use-display-labels'

export const PageHeadingEditor = ({
  labelKey,
  title,
}: {
  labelKey: EditablePageHeadingKey
  title: string
}) => {
  const { labels, saveLabels } = useDisplayLabels()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(title)
  const [error, setError] = useState('')

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setDraft(labels[labelKey])
      setError('')
    }
  }

  const save = () => {
    const normalized = draft.trim().slice(0, 64)
    if (!normalized) {
      setError('Enter a page heading before saving.')
      return
    }

    if (!saveLabels({ ...labels, [labelKey]: normalized })) {
      setError('Page heading changes are unavailable until server saving is configured.')
      return
    }
    setOpen(false)
    toast.success('Page heading saved.')
  }

  return (
    <>
      <Button
        aria-label={`Edit ${title} page heading`}
        onClick={() => handleOpenChange(true)}
        size="icon"
        title={`Edit ${title} page heading`}
        type="button"
        variant="ghost"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit page heading</DialogTitle>
            <DialogDescription>
              Update this visible page heading. Navigation and route names remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`page-heading-${labelKey}`}>Page heading</Label>
            <Input
              autoFocus
              id={`page-heading-${labelKey}`}
              maxLength={64}
              onChange={(event) => {
                setDraft(event.target.value)
                if (error) setError('')
              }}
              value={draft}
            />
            <p className="text-xs text-muted-foreground">{draft.length}/64 characters</p>
            {error ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={save} type="button">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
