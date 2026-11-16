'use client'

import { Archive } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { useHoverTip } from '@/components/pathways'
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
import { projectsClient } from '@/lib/api/projects'

export const ProjectArchiveDialog = ({
  projectId,
  title,
}: {
  projectId: string
  title: string
}) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { triggerProps, tip } = useHoverTip('Archive Project')

  const confirm = async () => {
    setBusy(true)
    try {
      await projectsClient.archiveProject(projectId)
      toast.success('Project archived.')
      setOpen(false)
      router.push('/projects')
    } catch {
      toast.error('The project could not be archived. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...triggerProps} aria-label="Archive Project" size="icon" variant="outline">
          <Archive className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      {tip}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this project?</DialogTitle>
          <DialogDescription>
            {title} will be removed from the project list for everyone in your organization.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Archiving' : 'Confirm archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
