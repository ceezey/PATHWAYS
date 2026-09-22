'use client'

import { RotateCcw, Save, Type } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { ConfirmationDialog, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type DisplayLabelKey,
  type DisplayLabels,
  defaultDisplayLabels,
  displayLabelGroups,
} from '@/constants/display-labels'
import { useDisplayLabels } from '@/hooks/use-display-labels'

const editableLabelDefinitions = displayLabelGroups.flatMap((group) => group.labels)

export const LabelSettingsWorkspace = () => {
  const { hydrated, labels, resetLabels, saveLabels } = useDisplayLabels()
  const [draft, setDraft] = useState<DisplayLabels>(labels)
  const [error, setError] = useState('')
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  useEffect(() => {
    if (hydrated) {
      setDraft(labels)
    }
  }, [hydrated, labels])

  const changed = useMemo(
    () => editableLabelDefinitions.some(({ key }) => draft[key] !== labels[key]),
    [draft, labels],
  )
  const restoreAvailable = useMemo(
    () =>
      editableLabelDefinitions.some(
        ({ key }) =>
          draft[key] !== defaultDisplayLabels[key] || labels[key] !== defaultDisplayLabels[key],
      ),
    [draft, labels],
  )

  const updateDraft = (key: DisplayLabelKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const blankLabel = editableLabelDefinitions.find(({ key }) => !draft[key].trim())

    if (blankLabel) {
      setError(`${blankLabel.label} cannot be blank.`)
      return
    }

    if (!saveLabels(draft)) {
      setError('Page heading changes are unavailable until server saving is configured.')
      return
    }
    toast.success('Page headings saved.')
  }

  const reset = () => {
    const defaults: DisplayLabels = { ...defaultDisplayLabels }
    if (!resetLabels()) {
      setError('Restoring shared page headings is unavailable until server saving is configured.')
      setResetDialogOpen(false)
      return
    }
    setResetDialogOpen(false)
    setDraft(defaults)
    setError('')
    toast.success('Default page headings restored.', {
      description: 'The current PATHWAYS presentation headings are active again.',
    })
  }

  return (
    <>
      <form className="space-y-6" onSubmit={save}>
        <PageHeader
          eyebrow="Administration"
          title={labels.moduleLabelSettings}
          description="Edit approved internal page headings. Sidebar labels and section titles remain fixed."
          actions={
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info">System Administrator</StatusBadge>
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/users">Open User Management</Link>
              </Button>
            </div>
          }
        />

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {displayLabelGroups.map((group) => (
              <SectionCard key={group.id} title={group.title} description={group.description}>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.labels.map((definition) => (
                    <label
                      className="space-y-2"
                      htmlFor={`display-label-${definition.key}`}
                      key={definition.key}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {definition.label}
                      </span>
                      <Input
                        aria-label={definition.label}
                        id={`display-label-${definition.key}`}
                        maxLength={64}
                        onChange={(event) => updateDraft(definition.key, event.target.value)}
                        value={draft[definition.key]}
                      />
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {definition.helperText}
                      </span>
                    </label>
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <SectionCard
              title="Page heading preview"
              description="A compact preview of the editable heading scope."
            >
              <div className="space-y-5 text-sm">
                {displayLabelGroups.map((group) => (
                  <PreviewGroup
                    key={group.id}
                    label={group.title.replace(' page headings', '')}
                    items={group.labels.map((definition) => ({
                      id: definition.key,
                      label: draft[definition.key],
                    }))}
                  />
                ))}
              </div>
            </SectionCard>

            <div className="rounded-sm border border-info/25 bg-info-subtle p-4 text-sm leading-6 text-info">
              <div className="flex items-start gap-3">
                <Type className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Page heading changes are unavailable until server saving is configured. Sidebar
                  labels, URLs, project records, role access, and public publishing rules remain
                  unchanged.
                </p>
              </div>
            </div>
          </aside>
        </section>

        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-4 flex flex-col-reverse gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-end">
          <Button
            className="gap-2"
            disabled={!hydrated || !restoreAvailable}
            onClick={() => setResetDialogOpen(true)}
            type="button"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Restore defaults
          </Button>
          <Button className="gap-2" disabled={!hydrated || !changed} type="submit">
            <Save className="h-4 w-4" aria-hidden="true" />
            Save headings
          </Button>
        </div>
      </form>
      <ConfirmationDialog
        confirmLabel="Restore all heading defaults"
        description={`This replaces ${editableLabelDefinitions.length} editable page headings with the PATHWAYS defaults.`}
        onConfirm={reset}
        onOpenChange={setResetDialogOpen}
        open={resetDialogOpen}
        title="Restore default page headings?"
      >
        <p className="rounded-sm border border-border bg-surface-subtle p-3 text-sm text-foreground">
          Affected scope: every editable dashboard, project, beneficiary, collection, analytics,
          alert, recommendation, report, and administration page heading.
        </p>
      </ConfirmationDialog>
    </>
  )
}

const PreviewGroup = ({
  label,
  items,
}: {
  label: string
  items: { id: string; label: string }[]
}) => (
  <div>
    <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    <div className="mt-2 space-y-1">
      {items.map((item) => (
        <p
          className="rounded-sm bg-surface-subtle px-3 py-2 font-medium text-foreground"
          key={item.id}
        >
          {item.label}
        </p>
      ))}
    </div>
  </div>
)
