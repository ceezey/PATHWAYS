'use client'

import { RotateCcw, Save, Type } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard, StatusBadge } from '@/components/pathways'
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
  const { labels } = useDisplayLabels()
  const [draft, setDraft] = useState<DisplayLabels>(labels)
  const [error, setError] = useState('')

  const changed = useMemo(
    () => editableLabelDefinitions.some(({ key }) => draft[key] !== labels[key]),
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

    toast.error('Label settings backend is not configured.', {
      description: 'Your draft remains on this page and has not been saved.',
    })
  }

  const reset = () => {
    const defaults: DisplayLabels = { ...defaultDisplayLabels }
    setDraft(defaults)
    setError('')
    toast.info('Draft restored to the default headings.', {
      description: 'No saved configuration was changed.',
    })
  }

  return (
    <form className="space-y-6" onSubmit={save}>
      <PageHeader
        eyebrow="Administration"
        title={labels.moduleLabelSettings}
        description="Prepare internal page-heading changes for a future settings integration. Sidebar labels and section titles stay fixed."
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">System Administrator</StatusBadge>
            <StatusBadge tone="neutral">Unsaved draft</StatusBadge>
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
                    <span className="text-sm font-medium text-foreground">{definition.label}</span>
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

          <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info">
            <div className="flex items-start gap-3">
              <Type className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                These fields change page headings only. Sidebar labels, sidebar section titles,
                URLs, project records, role access, and public publishing rules are unchanged.
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

      <div className="sticky bottom-4 flex flex-col-reverse gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-end">
        <Button className="gap-2" onClick={reset} type="button" variant="outline">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Restore defaults
        </Button>
        <Button className="gap-2" disabled={!changed} type="submit">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save headings
        </Button>
      </div>
    </form>
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
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="mt-2 space-y-1">
      {items.map((item) => (
        <p className="rounded-md bg-muted/60 px-3 py-2 font-medium text-foreground" key={item.id}>
          {item.label}
        </p>
      ))}
    </div>
  </div>
)
